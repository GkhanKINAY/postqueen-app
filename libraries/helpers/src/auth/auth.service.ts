import { sign, verify } from 'jsonwebtoken';
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
export class AuthService {
  static hashPassword(password: string) {
    return hashSync(password, 10);
  }
  static comparePassword(password: string, hash: string) {
    return compareSync(password, hash);
  }
  static signJWT(value: object) {
    return sign(value, process.env.JWT_SECRET!);
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
}
