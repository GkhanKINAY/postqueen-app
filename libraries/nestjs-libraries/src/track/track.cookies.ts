import { Request, Response } from 'express';
import { randomInt } from 'crypto';
import { makeId } from '@gitroom/nestjs-libraries/services/make.is';
import { getCookieUrlFromDomain } from '@gitroom/helpers/subdomain/subdomain.management';
import { areCookiesSecured } from '@gitroom/helpers/utils/cookies.secured';
import { isMetaPixelEnabled } from '@gitroom/nestjs-libraries/track/track.service';

const DAY = 1000 * 60 * 60 * 24;

const cookieOptions = (expiresInDays: number, httpOnly: boolean) => ({
  domain: getCookieUrlFromDomain(process.env.FRONTEND_URL!),
  ...(areCookiesSecured()
    ? {
        secure: true,
        httpOnly,
        sameSite: 'none' as const,
      }
    : {}),
  expires: new Date(Date.now() + DAY * expiresInDays),
});

// Sets the visitor cookies on the root domain, so the app and the API share
// them, and returns the ids for the Conversions API.
//
// _fbc / _fbp are written by the server in Meta's own format instead of
// waiting for the pixel: when an adblocker kills the pixel nothing else would
// create them, and the server events would lose the ad click and the browser
// id. They are not httpOnly because the pixel (when it loads) reuses them and
// the billing page reads them for the Stripe metadata. They are only written
// while the pixel is on (isMetaPixelEnabled); while it is off this sets the
// track cookie and nothing else, as before.
export const applyTrackCookies = (
  req: Request,
  res: Response,
  fbclid?: string
) => {
  const uniqueId = req?.cookies?.track || makeId(10);
  if (!req?.cookies?.track) {
    res.cookie('track', uniqueId, cookieOptions(365, true));
  }

  const currentFbc = req?.cookies?._fbc;
  if (!isMetaPixelEnabled()) {
    return {
      uniqueId,
      // the fbclid cookie was set by older versions of this endpoint
      fbc: currentFbc || req?.cookies?.fbclid || fbclid,
      fbp: req?.cookies?._fbp,
    };
  }

  // a new ad click replaces the old one, the same click keeps its creation time
  const isNewClick = !!fbclid && !currentFbc?.endsWith(`.${fbclid}`);
  const fbc = isNewClick
    ? `fb.1.${Date.now()}.${fbclid}`
    : // the fbclid cookie was set by older versions of this endpoint
      currentFbc || req?.cookies?.fbclid;
  if (isNewClick) {
    res.cookie('_fbc', fbc, cookieOptions(90, false));
  }

  const fbp = req?.cookies?._fbp || `fb.1.${Date.now()}.${randomInt(2 ** 31)}`;
  if (!req?.cookies?._fbp) {
    res.cookie('_fbp', fbp, cookieOptions(90, false));
  }

  return { uniqueId, fbc, fbp };
};
