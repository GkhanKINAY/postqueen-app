import { newsletterProviders } from '@gitroom/nestjs-libraries/newsletter/providers';
import { isProductNewsEnabled } from '@gitroom/helpers/utils/product.news.enabled';

export class NewsletterService {
  static getProvider() {
    if (isProductNewsEnabled()) {
      return newsletterProviders.find((p) => p.name === 'resend')!;
    }
    if (process.env.BEEHIIVE_API_KEY) {
      return newsletterProviders.find((p) => p.name === 'beehiiv')!;
    }
    if (process.env.LISTMONK_API_KEY) {
      return newsletterProviders.find((p) => p.name === 'listmonk')!;
    }

    return newsletterProviders.find((p) => p.name === 'empty')!;
  }
  static async register(email: string) {
    if (email.indexOf('@') === -1) {
      return;
    }
    return NewsletterService.getProvider().register(email);
  }
  /**
   * Null when there is no choice to show: the provider keeps none, or the
   * account has no mailbox (wallet and Farcaster sign-ins store an id there).
   */
  static async subscribed(email: string) {
    const provider = NewsletterService.getProvider();
    if (!provider.subscribed || email.indexOf('@') === -1) {
      return null;
    }
    return provider.subscribed(email);
  }
  /** What was stored, or null when nothing could be. */
  static async setSubscribed(email: string, on: boolean) {
    const provider = NewsletterService.getProvider();
    if (!provider.setSubscribed || email.indexOf('@') === -1) {
      return null;
    }
    await provider.setSubscribed(email, on);
    return on;
  }
  static async remove(email: string) {
    if (email.indexOf('@') === -1) {
      return;
    }
    await NewsletterService.getProvider().remove?.(email);
  }
  /** The list is kept by address, so the choice follows the account's new one. */
  static async changeEmail(from: string, to: string) {
    const provider = NewsletterService.getProvider();
    if (
      !provider.subscribed ||
      !provider.setSubscribed ||
      to.indexOf('@') === -1
    ) {
      return;
    }
    // An account that had no mailbox before joins like a new sign-up.
    if (from.indexOf('@') === -1) {
      await provider.register(to);
      return;
    }
    await provider.setSubscribed(to, await provider.subscribed(from));
  }
}
