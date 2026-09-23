import { createHmac, timingSafeEqual } from 'crypto';

/**
 * Reads the `signed_request` Meta posts to an app's deauthorize and data
 * deletion callbacks: `<signature>.<payload>`, both base64url, where the
 * signature is an HMAC-SHA256 of the encoded payload keyed with that app's
 * secret. Facebook, Instagram and Threads all sign the same way, each with its
 * own app secret, so the providers share this and pass their own.
 *
 * Returns null for anything that is not a request that app signed, so the
 * caller answers 400 without saying which check failed. Logs nothing: the
 * request carries a user id and the key is the app secret.
 */
export const parseMetaSignedRequest = (
  signedRequest: string,
  secret: string | undefined
): { platformUserId: string } | null => {
  // An empty key is a key anyone can sign with.
  if (!secret || typeof signedRequest !== 'string') {
    return null;
  }

  const [encodedSignature, payload, ...rest] = signedRequest.split('.');
  if (!encodedSignature || !payload || rest.length) {
    return null;
  }

  const signature = Buffer.from(encodedSignature, 'base64url');
  const expected = createHmac('sha256', secret).update(payload).digest();
  if (
    signature.length !== expected.length ||
    !timingSafeEqual(signature, expected)
  ) {
    return null;
  }

  let data: { algorithm?: unknown; user_id?: unknown };
  try {
    data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  } catch {
    return null;
  }

  if (
    !data ||
    typeof data.algorithm !== 'string' ||
    data.algorithm.toUpperCase() !== 'HMAC-SHA256'
  ) {
    return null;
  }

  const userId =
    typeof data.user_id === 'string' || typeof data.user_id === 'number'
      ? String(data.user_id)
      : '';
  if (!userId) {
    return null;
  }

  return { platformUserId: userId };
};
