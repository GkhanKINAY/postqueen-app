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
  /** Null when the provider keeps no choice to show. */
  static async subscribed(email: string) {
    const provider = NewsletterService.getProvider();
    return provider.subscribed ? provider.subscribed(email) : null;
  }
  static async setSubscribed(email: string, on: boolean) {
    await NewsletterService.getProvider().setSubscribed?.(email, on);
  }
  static async remove(email: string) {
    await NewsletterService.getProvider().remove?.(email);
  }
  /** The list is kept by address, so it moves with the account, choice and all. */
  static async changeEmail(from: string, to: string) {
    const provider = NewsletterService.getProvider();
    if (!provider.subscribed || !provider.setSubscribed || !provider.remove) {
      return;
    }
    await provider.setSubscribed(to, await provider.subscribed(from));
    await provider.remove(from);
  }
}
