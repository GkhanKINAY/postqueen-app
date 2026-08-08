/**
 * Whether a local sign-up must click an emailed link before it can log in.
 *
 * This used to be derived from "is an email provider configured", which tied
 * two unrelated decisions together: a deployment that only wanted working
 * password-reset mail was forced to also gate sign-up behind an activation
 * click. Being able to send mail and having to verify an address are separate
 * choices, so activation now has its own switch.
 *
 * It stays off unless a deployment asks for it. The paywall already stops an
 * unverified account from reaching the product on a billing install, and the
 * register endpoint is rate limited per email and per IP, so the gate buys
 * little beyond catching a mistyped address. Callers pair this with a
 * configured email provider, because requiring activation with nothing able to
 * send the link would lock every new account out permanently.
 */
export const isEmailActivationRequired = () =>
  process.env.REQUIRE_EMAIL_ACTIVATION === 'true';
