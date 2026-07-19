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

export function decrypt_legacy_using_IV(hexCiphertext: string) {
  try {
    return decryptWith(encryptionSecret(), hexCiphertext);
  } catch (err) {
    // Rows written before ENCRYPTION_KEY was introduced are under JWT_SECRET.
    // Try that once so introducing the split does not orphan existing data;
    // re-encryption happens naturally as those records are next written.
    if (
      process.env.ENCRYPTION_KEY &&
      process.env.JWT_SECRET &&
      process.env.ENCRYPTION_KEY !== process.env.JWT_SECRET
    ) {
      return decryptWith(process.env.JWT_SECRET, hexCiphertext);
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

  static fixedEncryption(value: string) {
    return encrypt_legacy_using_IV(value);
  }

  static fixedDecryption(hash: string) {
    return decrypt_legacy_using_IV(hash);
  }
}
