/**
 * Whether this installation can actually deliver email.
 *
 * Mirrors `EmailService.hasProvider()` on the backend, and has to keep mirroring
 * it: a provider class alone is not enough, because `sendEmail` returns early
 * when `EMAIL_FROM_ADDRESS` or `EMAIL_FROM_NAME` is missing, and both ship
 * commented out in `.env.example`.
 *
 * The frontend needs this to stop offering "Forgot password". That endpoint
 * always answers success on purpose — telling a caller whether an address is
 * registered is an enumeration oracle — so the screen cannot learn from the
 * response that nothing was sent. Without a provider the promise is a dead end
 * for everybody, and the honest thing is not to make it.
 */
export const isEmailEnabled = () =>
  (process.env.EMAIL_PROVIDER === 'resend' ||
    process.env.EMAIL_PROVIDER === 'nodemailer') &&
  !!process.env.EMAIL_FROM_ADDRESS &&
  !!process.env.EMAIL_FROM_NAME;
