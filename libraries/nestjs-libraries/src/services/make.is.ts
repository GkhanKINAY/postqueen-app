import { randomInt } from 'crypto';

const ALPHABET =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

/**
 * Random identifier from a CSPRNG.
 *
 * This function is not only used for throwaway ids: it generates organization
 * API keys, OAuth client secrets, authorization codes, access tokens and the
 * PKCE verifiers for every social provider. It previously used Math.random(),
 * which in V8 is xorshift128+ — its internal state can be recovered from a run
 * of consecutive outputs, and anyone able to harvest such a run (rotating an
 * OAuth secret in a loop, for instance) could then predict later values from
 * the same process, including credentials minted for other organizations.
 *
 * randomInt draws from the CSPRNG and rejects biased samples internally, so the
 * distribution over the alphabet stays uniform. Output shape is unchanged.
 */
export const makeId = (length: number) => {
  let text = '';

  for (let i = 0; i < length; i += 1) {
    text += ALPHABET.charAt(randomInt(ALPHABET.length));
  }

  return text;
};
