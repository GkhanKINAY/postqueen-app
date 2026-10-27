import { TrackEnum } from '@gitroom/nestjs-libraries/user/track.enum';
import { User } from '@gitroom/nestjs-libraries/database/prisma/generated/client';
import { Injectable, Logger } from '@nestjs/common';
import { createHash } from 'crypto';
import { META_GRAPH_API_VERSION } from '@gitroom/nestjs-libraries/integrations/social/facebook.provider';

// Both the pixel and its token: without them nothing is tracked, and callers
// skip the lookups they would do for it.
export const isMetaPixelEnabled = () =>
  !!process.env.FACEBOOK_PIXEL_ACCESS_TOKEN &&
  !!process.env.NEXT_PUBLIC_FACEBOOK_PIXEL;

// What a browser may report through /t. StartTrial and Purchase are sent only
// by the Stripe webhooks, so a request cannot invent a sale.
const BROWSER_EVENTS = [
  TrackEnum.ViewContent,
  TrackEnum.CompleteRegistration,
  TrackEnum.InitiateCheckout,
];

// The Conversions API is called directly instead of through
// facebook-nodejs-business-sdk: the SDK registers a process wide
// uncaughtException handler on first use that re-throws every error of the
// app (killing the process before Sentry reports it), and its requests have
// no timeout.
@Injectable()
export class TrackService {
  private hashValue(value: string) {
    return createHash('sha256')
      .update(value.trim().toLowerCase())
      .digest('hex');
  }

  // A _fbc cookie is sent as is, a bare fbclid has to be wrapped as
  // fb.<subdomainIndex>.<creationTime ms>.<fbclid> (index 1 when built on a server)
  private toFbc(fbc: string) {
    return fbc.startsWith('fb.') ? fbc : `fb.1.${Date.now()}.${fbc}`;
  }

  // An event the browser reports, through /t: only the ones a browser sees.
  trackBrowserEvent(
    uniqueId: string,
    ip: string,
    agent: string,
    tt: TrackEnum,
    additional: Record<string, any>,
    fbc?: string,
    user?: User,
    fbp?: string
  ) {
    if (!BROWSER_EVENTS.includes(Number(tt))) {
      return Promise.resolve();
    }
    return this.track(uniqueId, ip, agent, tt, additional, fbc, user, fbp);
  }

  // Never throws and never rejects: a pixel failure (bad token, Meta outage,
  // timeout) must not break the request or the webhook that fired it, so
  // callers fire it in the background.
  async track(
    uniqueId: string,
    ip: string,
    agent: string,
    tt: TrackEnum,
    additional: Record<string, any>,
    fbc?: string,
    user?: User,
    fbp?: string
  ) {
    const accessToken = process.env.FACEBOOK_PIXEL_ACCESS_TOKEN;
    const pixelId = process.env.NEXT_PUBLIC_FACEBOOK_PIXEL;
    const userAgent = agent || user?.agent;
    // website events are rejected without a user agent
    if (!isMetaPixelEnabled() || !userAgent) {
      return;
    }

    try {
      const clientIp = ip || user?.ip;
      const response = await fetch(
        `https://graph.facebook.com/${META_GRAPH_API_VERSION}/${pixelId}/events`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            access_token: accessToken,
            data: [
              {
                event_name: TrackEnum[tt],
                event_time: Math.floor(Date.now() / 1000),
                event_id: uniqueId || user?.id,
                event_source_url: process.env.FRONTEND_URL,
                action_source: 'website',
                user_data: {
                  client_user_agent: userAgent,
                  ...(clientIp ? { client_ip_address: clientIp } : {}),
                  ...(user?.email?.includes('@')
                    ? { em: [this.hashValue(user.email)] }
                    : {}),
                  ...(fbc ? { fbc: this.toFbc(fbc) } : {}),
                  ...(fbp ? { fbp } : {}),
                },
                ...(additional?.value
                  ? {
                      custom_data: {
                        value: additional.value,
                        currency: (additional.currency || 'USD').toUpperCase(),
                      },
                    }
                  : {}),
              },
            ],
          }),
          signal: AbortSignal.timeout(10000),
        }
      );

      if (!response.ok) {
        // Only Meta's error codes: its message can describe the user data it
        // refused, and error lines go to Sentry.
        const { error } = await response.json().catch(() => ({}) as any);
        Logger.warn(
          `[pixel] Meta refused ${TrackEnum[tt]}: ${response.status} ${JSON.stringify({
            code: error?.code,
            subcode: error?.error_subcode,
            trace: error?.fbtrace_id,
          })}`
        );
        return;
      }

      await response.body?.cancel();
    } catch (err: any) {
      Logger.warn(
        `[pixel] could not send ${TrackEnum[tt]}: ${String(err?.name || err)}`
      );
    }
  }
}
