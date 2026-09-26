import 'reflect-metadata';

import { Injectable } from '@nestjs/common';
import { XProvider } from '@gitroom/nestjs-libraries/integrations/social/x.provider';
import { SocialProvider } from '@gitroom/nestjs-libraries/integrations/social/social.integrations.interface';
import { toCredits } from '@gitroom/nestjs-libraries/database/prisma/subscriptions/pricing';
import { LinkedinProvider } from '@gitroom/nestjs-libraries/integrations/social/linkedin.provider';
import { RedditProvider } from '@gitroom/nestjs-libraries/integrations/social/reddit.provider';
import { DevToProvider } from '@gitroom/nestjs-libraries/integrations/social/dev.to.provider';
import { HashnodeProvider } from '@gitroom/nestjs-libraries/integrations/social/hashnode.provider';
import { FacebookProvider } from '@gitroom/nestjs-libraries/integrations/social/facebook.provider';
import { InstagramProvider } from '@gitroom/nestjs-libraries/integrations/social/instagram.provider';
import { YoutubeProvider } from '@gitroom/nestjs-libraries/integrations/social/youtube.provider';
import { TiktokProvider } from '@gitroom/nestjs-libraries/integrations/social/tiktok.provider';
import { TiktokBusinessProvider } from '@gitroom/nestjs-libraries/integrations/social/tiktok.business.provider';
import { PinterestProvider } from '@gitroom/nestjs-libraries/integrations/social/pinterest.provider';
import { DribbbleProvider } from '@gitroom/nestjs-libraries/integrations/social/dribbble.provider';
import { LinkedinPageProvider } from '@gitroom/nestjs-libraries/integrations/social/linkedin.page.provider';
import { ThreadsProvider } from '@gitroom/nestjs-libraries/integrations/social/threads.provider';
import { DiscordProvider } from '@gitroom/nestjs-libraries/integrations/social/discord.provider';
import { SlackProvider } from '@gitroom/nestjs-libraries/integrations/social/slack.provider';
import { MastodonProvider } from '@gitroom/nestjs-libraries/integrations/social/mastodon.provider';
import { BlueskyProvider } from '@gitroom/nestjs-libraries/integrations/social/bluesky.provider';
import { LemmyProvider } from '@gitroom/nestjs-libraries/integrations/social/lemmy.provider';
import { InstagramStandaloneProvider } from '@gitroom/nestjs-libraries/integrations/social/instagram.standalone.provider';
import { FarcasterProvider } from '@gitroom/nestjs-libraries/integrations/social/farcaster.provider';
import { TelegramProvider } from '@gitroom/nestjs-libraries/integrations/social/telegram.provider';
import { NostrProvider } from '@gitroom/nestjs-libraries/integrations/social/nostr.provider';
import { VkProvider } from '@gitroom/nestjs-libraries/integrations/social/vk.provider';
import { WordpressProvider } from '@gitroom/nestjs-libraries/integrations/social/wordpress.provider';
import { ListmonkProvider } from '@gitroom/nestjs-libraries/integrations/social/listmonk.provider';
import { GmbProvider } from '@gitroom/nestjs-libraries/integrations/social/gmb.provider';
import { KickProvider } from '@gitroom/nestjs-libraries/integrations/social/kick.provider';
import { TwitchProvider } from '@gitroom/nestjs-libraries/integrations/social/twitch.provider';
import { SocialAbstract } from '@gitroom/nestjs-libraries/integrations/social.abstract';
import { MoltbookProvider } from '@gitroom/nestjs-libraries/integrations/social/moltbook.provider';
import { SkoolProvider } from '@gitroom/nestjs-libraries/integrations/social/skool.provider';
import { WhopProvider } from '@gitroom/nestjs-libraries/integrations/social/whop.provider';
import { MeweProvider } from '@gitroom/nestjs-libraries/integrations/social/mewe.provider';
import { TumblrProvider } from '@gitroom/nestjs-libraries/integrations/social/tumblr.provider';

export const socialIntegrationList: Array<SocialAbstract & SocialProvider> = [
  new XProvider(),
  new LinkedinProvider(),
  new LinkedinPageProvider(),
  new RedditProvider(),
  new InstagramProvider(),
  new InstagramStandaloneProvider(),
  new FacebookProvider(),
  new ThreadsProvider(),
  new YoutubeProvider(),
  new GmbProvider(),
  new TiktokProvider(),
  new TiktokBusinessProvider(),
  new PinterestProvider(),
  new DribbbleProvider(),
  new DiscordProvider(),
  new SlackProvider(),
  new KickProvider(),
  new TwitchProvider(),
  new MastodonProvider(),
  new BlueskyProvider(),
  new LemmyProvider(),
  new FarcasterProvider(),
  new TelegramProvider(),
  new NostrProvider(),
  new VkProvider(),
  new DevToProvider(),
  new HashnodeProvider(),
  new WordpressProvider(),
  new ListmonkProvider(),
  new MoltbookProvider(),
  new WhopProvider(),
  new SkoolProvider(),
  new MeweProvider(),
  new TumblrProvider(),
  // new MastodonCustomProvider(),
];

@Injectable()
export class IntegrationManager {
  // Both are env-driven so cloud and self-hosted instances can differ:
  // HIDDEN_PROVIDERS ("tiktok,x") hides providers from the add-channel screen,
  // MIGRATE_PROVIDERS ("tiktok:tiktok-business") routes a reconnect of the old
  // provider through the new provider's OAuth and migrates the channel in
  // place, keeping its id, scheduled posts and settings.
  isHiddenProvider(identifier: string) {
    return (process.env.HIDDEN_PROVIDERS || '')
      .split(',')
      .map((p) => p.trim())
      .includes(identifier);
  }

  // Note: a target provider that implements `reConnect` is not supported - the
  // connect callback would run reConnect with the old app-scoped id before the
  // migration is attempted.
  getMigrationTarget(identifier: string): string | undefined {
    const [, target] =
      (process.env.MIGRATE_PROVIDERS || '')
        .split(',')
        .map((p) => p.trim().split(':'))
        .find(([from, to]) => from === identifier && !!to) || [];

    return target &&
      target !== identifier &&
      this.getAllowedSocialsIntegrations().includes(target)
      ? target
      : undefined;
  }

  // Reverse lookup of MIGRATE_PROVIDERS: the providers whose channels a fresh
  // connect of `identifier` should adopt instead of creating a duplicate.
  getMigrationSources(identifier: string): string[] {
    return (process.env.MIGRATE_PROVIDERS || '')
      .split(',')
      .map((p) => p.trim().split(':'))
      .filter(
        ([from, to]) =>
          to === identifier &&
          !!from &&
          from !== identifier &&
          this.getAllowedSocialsIntegrations().includes(from)
      )
      .map(([from]) => from);
  }

  // The providers one platform callback speaks for. A platform takes one
  // callback URL per app, and one app can sit behind several providers that
  // log in through it, so the callback covers every provider whose own secret
  // verifies the same request for the same user, hidden ones included: a
  // hidden provider can still have channels.
  async getPlatformCallbackProviders(
    signedRequest: string,
    platformUserId: string
  ): Promise<string[]> {
    const verified = await Promise.all(
      socialIntegrationList
        .filter((p) => p.verifyPlatformCallback)
        .map(async (p) => ({
          identifier: p.identifier,
          platformUserId: (await p.verifyPlatformCallback!(signedRequest))
            ?.platformUserId,
        }))
    );

    return verified
      .filter((p) => p.platformUserId === platformUserId)
      .map((p) => p.identifier);
  }

  async getAllIntegrations() {
    return {
      social: await Promise.all(
        socialIntegrationList
          .filter((p) => !this.isHiddenProvider(p.identifier))
          .map(async (p) => ({
            name: p.name,
            identifier: p.identifier,
            toolTip: p.toolTip,
            category: p.category,
            editor: p.editor,
            isExternal: !!p.externalUrl,
            isWeb3: !!p.isWeb3,
            isChromeExtension: !!p.isChromeExtension,
            // The grid needs this to draw the lock. It is only ever *whether* the
            // provider is held back during a trial — whether this organization is
            // trialing comes from the user, so the flag is the same for everyone
            // and this list stays cacheable.
            trialLocked: !!p.trialLocked,
            // Same idea as trialLocked: the NEW corner badge is a provider
            // property, so the grid never hardcodes identifiers.
            isNew: !!p.isNew,
            ...(p.extensionCookies
              ? { extensionCookies: p.extensionCookies }
              : {}),
            ...(p.customFields ? { customFields: await p.customFields() } : {}),
          }))
      ),
      article: [] as any[],
    };
  }

  getAllTools(): {
    [key: string]: {
      description: string;
      dataSchema: any;
      methodName: string;
    }[];
  } {
    return socialIntegrationList.reduce(
      (all, current) => ({
        ...all,
        [current.identifier]:
          Reflect.getMetadata('custom:tool', current.constructor.prototype) ||
          [],
      }),
      {}
    );
  }

  getAllRulesDescription(): {
    [key: string]: string;
  } {
    return socialIntegrationList.reduce(
      (all, current) => ({
        ...all,
        [current.identifier]:
          Reflect.getMetadata(
            'custom:rules:description',
            current.constructor
          ) || '',
      }),
      {}
    );
  }

  // What a plug costs from the credits balance, in credits: each run's look
  // at the post, and acting on it, and acting with a link in what it writes
  // when that costs more. Nothing on a network that does not bill.
  private plugCredits(
    provider: SocialProvider,
    plug: string,
    fields: { name: string }[] = []
  ) {
    const check = provider.creditCost?.({ type: 'plug-check', plug }) || 0;
    const trigger =
      provider.creditCost?.({ type: 'plug-trigger', plug, fields: {} }) || 0;
    const withLink =
      provider.creditCost?.({
        type: 'plug-trigger',
        plug,
        fields: Object.fromEntries(
          fields.map((field) => [field.name, 'https://example.com'])
        ),
      }) || 0;
    return check || trigger
      ? {
          check: toCredits(check),
          trigger: toCredits(trigger),
          ...(withLink > trigger ? { withLink: toCredits(withLink) } : {}),
        }
      : undefined;
  }

  getAllPlugs() {
    return socialIntegrationList
      .map((provider) => {
        return {
          name: provider.name,
          identifier: provider.identifier,
          plugs: (
            Reflect.getMetadata(
              'custom:plug',
              provider.constructor.prototype
            ) || []
          )
            .filter((f: any) => !f.disabled)
            .map((p: any) => ({
              ...p,
              credits: this.plugCredits(provider, p.methodName, p.fields),
              fields: p.fields.map((c: any) => ({
                ...c,
                validation: c?.validation?.toString(),
              })),
            })),
        };
      })
      .filter((f) => f.plugs.length);
  }

  /** Every method a provider runs as a plug, switched off or not. */
  getPlugMethodNames(providerName: string): string[] {
    const p = this.getSocialIntegration(providerName);
    return ['custom:plug', 'custom:internal_plug'].flatMap((key) =>
      (Reflect.getMetadata(key, p?.constructor.prototype || {}) || []).map(
        (f: { methodName: string }) => f.methodName
      )
    );
  }

  getInternalPlugs(providerName: string) {
    const p = socialIntegrationList.find((p) => p.identifier === providerName)!;
    return {
      internalPlugs:
        (
          Reflect.getMetadata(
            'custom:internal_plug',
            p.constructor.prototype
          ) || []
        )
          .filter((f: any) => !f.disabled)
          .map((f: any) => ({
            ...f,
            credits: this.plugCredits(p, f.methodName, f.fields),
          })) || [],
    };
  }

  getAllowedSocialsIntegrations() {
    return socialIntegrationList.map((p) => p.identifier);
  }
  getSocialIntegration(integration: string): SocialProvider {
    return socialIntegrationList.find((i) => i.identifier === integration)!;
  }

  /** The network's name as people know it ("Instagram"), never its identifier. */
  getSocialIntegrationName(integration: string) {
    return (this.getSocialIntegration(integration)?.name || integration)
      .split('\n')[0]
      .trim();
  }
}
