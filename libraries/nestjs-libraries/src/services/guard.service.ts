import { Injectable } from '@nestjs/common';

export type GuardAction =
  | 'otp_request'
  | 'otp_verify'
  | 'login'
  | 'register'
  | 'checkout';

export interface GuardChallengeInput {
  action: GuardAction;
  ip?: string;
  email?: string;
  captchaToken?: string;
}

export interface GuardDecision {
  allow: boolean;
  requireCaptcha: boolean;
  reason?: string;
}

/**
 * Thin client for an optional external Guard service. This is the only security
 * surface in the app: an interface plus a fallback. When GUARD_URL is unset,
 * every action is allowed and no captcha is demanded, so the app stays fully
 * functional on its own. Set GUARD_URL to a service that answers
 * POST /guard/challenge to add rate-limiting, captcha verification and
 * anti-abuse checks over a network boundary.
 */
@Injectable()
export class GuardService {
  private get url() {
    return process.env.GUARD_URL;
  }

  isEnabled() {
    return !!this.url;
  }

  async challenge(input: GuardChallengeInput): Promise<GuardDecision> {
    if (!this.url) {
      return { allow: true, requireCaptcha: false };
    }

    try {
      const res = await fetch(`${this.url.replace(/\/$/, '')}/guard/challenge`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Guard-Secret': process.env.GUARD_SECRET || '',
        },
        body: JSON.stringify(input),
      });

      if (!res.ok) {
        // Fail-open so a Guard outage can't lock every user out of auth. Flip
        // to `allow: false` here if you'd rather fail-closed under uncertainty.
        return {
          allow: true,
          requireCaptcha: false,
          reason: 'guard_unavailable',
        };
      }

      const data = (await res.json()) as Partial<GuardDecision>;
      return {
        allow: data.allow !== false,
        requireCaptcha: !!data.requireCaptcha,
        reason: data.reason,
      };
    } catch {
      return { allow: true, requireCaptcha: false, reason: 'guard_unreachable' };
    }
  }
}
