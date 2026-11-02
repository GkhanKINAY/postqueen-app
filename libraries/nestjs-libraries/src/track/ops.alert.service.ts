import { Injectable, Logger } from '@nestjs/common';

/**
 * Posts an operations warning to PostQueen's alerts channel in Slack, the one
 * the host watchdog and the backups already post to, in their shape: an emoji
 * and a "[PostQueen]" line.
 *
 * Unset `SLACK_ALERT_WEBHOOK_URL` turns it off, so dev and self-hosted installs
 * need nothing. Like SalesNotificationService it never throws, and it logs
 * Slack's own reason for a refusal, because `fetch` only rejects on a
 * transport error and a rejected webhook would otherwise vanish without a
 * trace.
 */
@Injectable()
export class OpsAlertService {
  async alert(text: string) {
    const webhookUrl = process.env.SLACK_ALERT_WEBHOOK_URL;
    if (!webhookUrl) {
      return false;
    }

    try {
      const res = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: `:warning: [PostQueen] ${text}` }),
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) {
        const reason = await res.text().catch(() => '');
        Logger.error(
          `[ops-alert] REJECTED by Slack: ${res.status} ${reason.slice(0, 200)}`
        );
        return false;
      }
      return true;
    } catch (err) {
      Logger.error(
        `[ops-alert] not delivered: ${(err as Error)?.message || err}`
      );
      return false;
    }
  }
}
