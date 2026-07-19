/**
 * Whether auth cookies should carry `secure` / `httpOnly` / `sameSite=none`.
 *
 * `NOT_SECURED` exists so the app can run over plain HTTP locally. It used to
 * be read as `!process.env.NOT_SECURED`, a truthiness test on a string — so
 * the value `"false"` turned protection OFF, which is the opposite of what it
 * says. `.env.example` shipped the line as `NOT_SECURED=false`, so uncommenting
 * it was enough to drop every cookie flag at once and start echoing the session
 * token in a plain response header.
 *
 * Only the literal string "true" disables the flags; anything else is treated
 * as secured.
 */
export const areCookiesSecured = () => process.env.NOT_SECURED !== 'true';
