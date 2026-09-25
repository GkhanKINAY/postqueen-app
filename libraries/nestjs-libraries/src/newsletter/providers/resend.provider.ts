import { NewsletterInterface } from '@gitroom/nestjs-libraries/newsletter/newsletter.interface';

/**
 * Product news through Resend. Every account's address is a contact in one
 * segment, and the Settings switch is that contact's subscription to one
 * topic. A broadcast goes to the segment with the topic set, so it skips an
 * address that turned the topic off, or unsubscribed from everything on
 * Resend's own page.
 */
export class ResendProvider implements NewsletterInterface {
  name = 'resend';

  private async request(method: string, path: string, body?: unknown) {
    const res = await fetch(`https://api.resend.com${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Authorization: `Bearer ${process.env.RESEND_CONTACTS_API_KEY}`,
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    if (res.status === 404) {
      return null;
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
  // joins the segment.
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
