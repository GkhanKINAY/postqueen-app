import { NewsletterInterface } from '@gitroom/nestjs-libraries/newsletter/newsletter.interface';

/**
 * Product news through Resend. Every account's address is a contact in one
 * segment, and the Settings switch is that contact's subscription to one
 * topic. A broadcast goes to the segment with the topic set, so it skips an
 * address that turned the topic off, or unsubscribed from everything on
 * Resend's own page.
 */
export class ResendNewsletterProvider implements NewsletterInterface {
  name = 'resend';

  /**
   * Null for a contact that does not exist. Any other 404 means a wrong
   * segment or topic id, and throws, so a save never reports success for a
   * choice that was not stored. Sign-up, deletion and address changes wait on
   * these calls, so each one gives up after ten seconds, and a rate limit or a
   * Resend fault gets one more try.
   */
  private async request(
    method: string,
    path: string,
    body?: unknown,
    retry = true
  ): Promise<any> {
    const res = await fetch(`https://api.resend.com${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Authorization: `Bearer ${process.env.RESEND_CONTACTS_API_KEY}`,
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(10000),
    });
    if (res.status === 404 && /^\/contacts\/[^/]+$/.test(path)) {
      return null;
    }
    if (retry && (res.status === 429 || res.status >= 500)) {
      const wait = Math.min(Number(res.headers.get('retry-after')) || 1, 5);
      await new Promise((resolve) => setTimeout(resolve, wait * 1000));
      return this.request(method, path, body, false);
    }
    if (!res.ok) {
      throw new Error(`Resend contacts ${method} answered ${res.status}`);
    }
    return res.json();
  }

  private contact(email: string) {
    return `/contacts/${encodeURIComponent(email)}`;
  }

  // Creating a contact that already exists clears its "unsubscribed" flag,
  // which would quietly undo someone's unsubscribe, so an existing one only
  // joins the segment (a second join is a no-op).
  private async join(email: string) {
    const segment = process.env.RESEND_NEWS_SEGMENT_ID;
    if (await this.request('GET', this.contact(email))) {
      await this.request('POST', `${this.contact(email)}/segments/${segment}`);
      return;
    }
    await this.request('POST', '/contacts', {
      email,
      segments: [{ id: segment }],
    });
  }

  async register(email: string) {
    // Sign-up waits on this, and must not fail because the list did.
    try {
      await this.join(email);
    } catch (err) {
      console.error('[newsletter] could not add a contact', err);
    }
  }

  async subscribed(email: string) {
    const contact = await this.request('GET', this.contact(email));
    if (!contact || contact.unsubscribed) {
      return false;
    }
    const topics = await this.request('GET', `${this.contact(email)}/topics`);
    return (
      topics?.data?.find(
        (topic: { id: string }) => topic.id === process.env.RESEND_NEWS_TOPIC_ID
      )?.subscription !== 'opt_out'
    );
  }

  async setSubscribed(email: string, on: boolean) {
    await this.join(email);
    await this.request('PATCH', `${this.contact(email)}/topics`, [
      {
        id: process.env.RESEND_NEWS_TOPIC_ID,
        subscription: on ? 'opt_in' : 'opt_out',
      },
    ]);
    // Turning the news back on here also undoes an unsubscribe from Resend's
    // page, which would otherwise keep the address off every broadcast.
    if (on) {
      await this.request('PATCH', this.contact(email), { unsubscribed: false });
    }
  }

  async remove(email: string) {
    await this.request('DELETE', this.contact(email));
  }
}
