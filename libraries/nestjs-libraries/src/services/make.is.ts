const ALPHABET =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

// Largest multiple of the alphabet size that fits in a byte. Bytes at or above
// it are discarded so every character stays equally likely — taking the modulo
// of all 256 values would favour the first few letters.
const CEILING = 256 - (256 % ALPHABET.length);

/**
 * Random identifier from a CSPRNG.
 *
 * This is not only used for throwaway ids: it generates organization API keys,
 * OAuth client secrets, authorization codes, access tokens and the PKCE
 * verifiers for every social provider. It used Math.random(), which in V8 is
 * xorshift128+ — its internal state can be recovered from a run of consecutive
 * outputs, and anyone able to harvest such a run could then predict later
 * values from the same process, including credentials minted for other
 * organizations.
 *
 * Uses Web Crypto rather than node:crypto because this module is imported by
 * client components too — the modal manager, the composer, the agent panel.
 * `randomInt` is a Node builtin with no browser equivalent: bundled for the
 * browser it resolves to crypto-browserify, which does not export it, so all of
 * those components would throw on hydration. `getRandomValues` exists in
 * Node 18+ and in every browser.
 */
export const makeId = (length: number) => {
  let text = '';

  while (text.length < length) {
    const bytes = new Uint8Array(length - text.length);
    globalThis.crypto.getRandomValues(bytes);

    for (const byte of bytes) {
      if (byte >= CEILING) {
        continue;
      }

      text += ALPHABET.charAt(byte % ALPHABET.length);
    }
  }

  return text;
};
