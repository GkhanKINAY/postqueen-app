import { sign, verify, SignOptions } from 'jsonwebtoken';
import { hashSync, compareSync } from 'bcrypt';
import crypto from 'crypto';
// @ts-ignore
import EVP_BytesToKey from 'evp_bytestokey';
const algorithm = 'aes-256-cbc';
const { keyLength, ivLength } = crypto.getCipherInfo(algorithm);

function deriveLegacyKeyIv(secret: string) {
  const { keyLength, ivLength } = crypto.getCipherInfo(algorithm); // 32, 16
  const pass = Buffer.isBuffer(secret) ? secret : Buffer.from(secret ?? '', 'utf8');

  // evp_bytestokey: key length in **bits**, IV length in **bytes**
  const { key, iv } = EVP_BytesToKey(pass, null, keyLength * 8, ivLength, 'md5');

  if (key.length !== keyLength || iv.length !== ivLength) {
    throw new Error(`Derived wrong sizes (key=${key.length}, iv=${iv.length})`);
  }
  return { key, iv };
}

/**
 * Key used for encryption at rest, separate from the JWT signing key.
 *
 * These were the same value, which quietly made JWT_SECRET impossible to
 * rotate: it signs sessions *and* encrypts every integration's OAuth and
 * refresh tokens, provider credentials and stored cookies. Rotating it would
 * have made all of those undecryptable, disconnecting every social account.
 *
 * Falls back to JWT_SECRET when unset, so an existing install — including any
 * self-hosted one — keeps working untouched.
 */
function encryptionSecret() {
  return process.env.ENCRYPTION_KEY || process.env.JWT_SECRET!;
}

function decryptWith(secret: string, hexCiphertext: string) {
  const { key, iv } = deriveLegacyKeyIv(secret);
  const decipher = crypto.createDecipheriv(algorithm, key, iv);
  const out = Buffer.concat([
    decipher.update(hexCiphertext, 'hex'),
    decipher.final(),
  ]);
  return out.toString('utf8');
}

/**
 * Keys to try for data written before the current one.
 *
 * PREVIOUS_ENCRYPTION_KEY exists so this list does not depend on JWT_SECRET.
 * It used to fall back to JWT_SECRET's *current* value, which quietly made
 * rotating that key destructive: rows encrypted under the old one are only
 * re-encrypted if something happens to rewrite them, and a refresh token for
 * an integration nobody touches never is. Rotating would have orphaned them
 * permanently.
 *
 * JWT_SECRET stays last for installs that predate the split and have not set
 * anything; set PREVIOUS_ENCRYPTION_KEY to the old value before rotating it.
 */
function legacySecrets() {
  const current = encryptionSecret();

  return [process.env.PREVIOUS_ENCRYPTION_KEY, process.env.JWT_SECRET].filter(
    (secret): secret is string => !!secret && secret !== current
  );
}

export function decrypt_legacy_using_IV(hexCiphertext: string) {
  try {
    return decryptWith(encryptionSecret(), hexCiphertext);
  } catch (err) {
    for (const secret of legacySecrets()) {
      try {
        return decryptWith(secret, hexCiphertext);
      } catch {
        // Try the next one; rethrow the original failure if none work.
      }
    }

    throw err;
  }
}

export function encrypt_legacy_using_IV(utf8Plaintext: string) {
  const { key, iv } = deriveLegacyKeyIv(encryptionSecret());
  const cipher = crypto.createCipheriv(algorithm, key, iv);
  const out = Buffer.concat([cipher.update(utf8Plaintext, 'utf8'), cipher.final()]);
  return out.toString('hex');
}

/**
 * Channel OAuth tokens (Integration.token and refreshToken) at rest, so a copy
 * of the database holds nothing that can post as the user. AES-256-GCM with a
 * fresh IV per value, under a key derived from ENCRYPTION_KEY, and
 * authenticated, unlike the fixed-IV format above. The prefix is what tells
 * an encrypted value from one written before this existed, or with
 * ENCRYPT_INTEGRATION_TOKENS=false: those are read as they are.
 */
export const INTEGRATION_TOKEN_PREFIX = 'enc:v1:';
const tokenKeys = new Map<string, Buffer>();

function tokenKey(secret: string) {
  let key = tokenKeys.get(secret);
  if (!key) {
    key = Buffer.from(
      crypto.hkdfSync('sha256', secret, '', 'postqueen integration token', 32)
    );
    tokenKeys.set(secret, key);
  }
  return key;
}

export class AuthService {
  static hashPassword(password: string) {
    return hashSync(password, 10);
  }
  static comparePassword(password: string, hash: string) {
    return compareSync(password, hash);
  }
  static signJWT(value: object, options?: SignOptions) {
    return sign(value, process.env.JWT_SECRET!, options);
  }

  /**
   * Compare a presented secret with the stored one in constant time. `!==`
   * returns at the first character that differs, which is what makes a
   * comparison measurable from outside.
   */
  static safeEqual(a: string, b: string) {
    const left = Buffer.from(a);
    const right = Buffer.from(b);
    return left.length === right.length && crypto.timingSafeEqual(left, right);
  }
  static verifyJWT(token: string) {
    return verify(token, process.env.JWT_SECRET!);
  }

  /**
   * Verify a token that must NOT be interchangeable with a session cookie.
   *
   * `signJWT` sets no audience, no issuer and no expiry, so every token this
   * app signs with `JWT_SECRET` is accepted by every `verifyJWT` in it —
   * including the session cookie, which is the whole User row signed with that
   * same key. Any unauthenticated endpoint that treats "signed" as "authorized"
   * therefore accepts a logged-in user's own cookie as its credential.
   *
   * Separating the key is what makes that structurally impossible rather than
   * merely unlikely. Returns null instead of throwing when the secret is unset,
   * so a caller can refuse the route outright on an install that never
   * configured it.
   */
  static verifyJWTWithSecret(token: string, secret: string | undefined) {
    if (!secret) {
      return null;
    }
    try {
      return verify(token, secret);
    } catch {
      return null;
    }
  }

  static fixedEncryption(value: string) {
    return encrypt_legacy_using_IV(value);
  }

  static fixedDecryption(hash: string) {
    return decrypt_legacy_using_IV(hash);
  }

  static isEncryptedToken(value?: string | null) {
    return !!value && value.startsWith(INTEGRATION_TOKEN_PREFIX);
  }

  static encryptToken(value: string) {
    if (!value || AuthService.isEncryptedToken(value)) {
      return value;
    }
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv(
      'aes-256-gcm',
      tokenKey(encryptionSecret()),
      iv
    );
    const data = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
    return (
      INTEGRATION_TOKEN_PREFIX +
      Buffer.concat([iv, cipher.getAuthTag(), data]).toString('base64')
    );
  }

  static decryptToken(value: string) {
    if (!AuthService.isEncryptedToken(value)) {
      return value;
    }
    const raw = Buffer.from(value.slice(INTEGRATION_TOKEN_PREFIX.length), 'base64');
    for (const secret of [encryptionSecret(), ...legacySecrets()]) {
      try {
        const decipher = crypto.createDecipheriv(
          'aes-256-gcm',
          tokenKey(secret),
          raw.subarray(0, 12),
          { authTagLength: 16 }
        );
        decipher.setAuthTag(raw.subarray(12, 28));
        return Buffer.concat([
          decipher.update(raw.subarray(28)),
          decipher.final(),
        ]).toString('utf8');
      } catch {
        // Try the next key.
      }
    }

    // Unreadable under every configured key. Throwing here would fail every
    // query that includes this channel (a post list, a workflow step); an
    // empty token fails at the platform instead, and the channel asks to be
    // reconnected like any other expired one.
    console.error(
      '[integration-token] a stored token could not be decrypted with any configured key'
    );
    return '';
  }
}
