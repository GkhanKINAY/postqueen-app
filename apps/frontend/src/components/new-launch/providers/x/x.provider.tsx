'use client';

import { useCallback, useEffect, useMemo } from 'react';
import useSWR from 'swr';
import {
  PostComment,
  withProvider,
} from '@gitroom/frontend/components/new-launch/providers/high.order.provider';
import { ThreadFinisher } from '@gitroom/frontend/components/new-launch/finisher/thread.finisher';
import { FormChoice } from '@gitroom/react/form/form.choice';
import { FormSection } from '@gitroom/react/form/form.section';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { useSettings } from '@gitroom/frontend/components/launches/helpers/use.values';
import { useIntegration } from '@gitroom/frontend/components/launches/helpers/use.integration';
import { useCustomProviderFunction } from '@gitroom/frontend/components/launches/helpers/use.custom.provider.function';
import { XDto } from '@gitroom/nestjs-libraries/dtos/posts/providers-settings/x.dto';
import { Input } from '@gitroom/react/form/input';
import { Checkbox } from '@gitroom/react/form/checkbox';
import { MediaComponent } from '@gitroom/frontend/components/media/media.component';

type XSubscriptionInfo = {
  subscriptionType?: string;
  verified: boolean;
  verifiedType?: string;
};

/**
 * What X says this account subscribes to.
 *
 * Its own hook around one SWR call, so `rules-of-hooks` is satisfied without an
 * eslint-disable. No `keepPreviousData`: the key carries an integration id, and
 * one channel's entitlements shown under another channel's name would be wrong
 * data rather than a stale view.
 *
 * Unlike TikTok's creator info, a failure here is deliberately *not* turned
 * into an error state the UI acts on. There the risk runs one way — offering a
 * privacy level TikTok refuses — so a failed lookup has to stop the guess.
 * Here it runs the other way: the only thing this answer can do is take
 * options away, so a lookup that did not arrive must leave the full list
 * standing. Hiding a capability from someone who pays for it is the worse
 * failure, and the one CLAUDE.md forbids.
 */
const useXSubscription = (integrationId?: string) => {
  const call = useCustomProviderFunction();
  const get = call.get;

  const load = useCallback(async () => {
    const info = await get('subscriptionInfo');
    if (!info || typeof info !== 'object') {
      throw new Error('X did not answer with subscription info');
    }

    return info as XSubscriptionInfo;
  }, [get]);

  return useSWR(integrationId ? `x-subscription-${integrationId}` : null, load, {
    refreshWhenHidden: false,
    refreshWhenOffline: false,
    revalidateOnFocus: false,
    revalidateIfStale: false,
    revalidateOnMount: true,
    revalidateOnReconnect: false,
    refreshInterval: 0,
  });
};

const SettingsComponent = () => {
  const t = useT();
  const { register, watch, setValue } = useSettings();
  const { integration } = useIntegration();
  const postType = watch('post_type') || 'post';
  const whoCanReplyValue = watch('who_can_reply_post');

  const { data: subscription } = useXSubscription(integration?.id);

  // `None` is the documented value for an account with no X Premium
  // subscription, and X returns the real one only for the authenticated user,
  // which is whose token the lookup used. Every other answer — a paid tier, a
  // value this code has not seen, a lookup still in flight or one that failed —
  // leaves the full list alone. Only a platform saying "no subscription" in as
  // many words may remove anything.
  //
  // `verified` cannot stand in for this. It is true for blue, business and
  // government alike, while the restricted reply audiences and Articles are
  // subscription features, so it says yes to accounts X would refuse and no to
  // accounts X would allow.
  const withoutPremium = subscription?.subscriptionType === 'None';

  const whoCanReply = useMemo(
    () => [
      { label: 'Everyone', value: 'everyone', icon: 'globe' as const },
      {
        label: 'Accounts you follow',
        value: 'following',
        icon: 'users' as const,
      },
      {
        label: 'Mentioned accounts',
        value: 'mentionedUsers',
        icon: 'user' as const,
      },
      ...(withoutPremium
        ? []
        : [
            {
              label: 'Subscribers',
              value: 'subscribers',
              icon: 'status' as const,
            },
            {
              label: 'Verified accounts',
              value: 'verified',
              icon: 'lock' as const,
            },
          ]),
    ],
    [withoutPremium]
  );

  const postTypes = useMemo(
    () => [
      { value: 'post', label: t('label_post_type_post', 'Post'), icon: 'post' as const },
      ...(withoutPremium
        ? []
        : [
            {
              value: 'article',
              label: t('label_post_type_article', 'Article (long-form)'),
              icon: 'article' as const,
            },
          ]),
    ],
    [withoutPremium, t]
  );

  const premiumNotice = withoutPremium
    ? t(
        'x_premium_only_settings',
        'Restricted reply audiences and Articles need an X Premium subscription, and this account has none, so they are not offered here.'
      )
    : '';

  // A choice X has just said this account cannot use must not stay selected and
  // be submitted, the same reason TikTok clears a privacy level it withdrew.
  // Both writes are guarded on the lookup having actually answered, so nothing
  // is cleared while the answer is still missing.
  useEffect(() => {
    if (!withoutPremium) {
      return;
    }

    if (
      whoCanReplyValue === 'subscribers' ||
      whoCanReplyValue === 'verified'
    ) {
      setValue('who_can_reply_post', 'everyone');
    }

    if (postType === 'article') {
      setValue('post_type', 'post');
    }
  }, [withoutPremium, whoCanReplyValue, postType, setValue]);

  return (
    <>
      {premiumNotice && (
        <FormSection icon="warn">
          <div className="text-[13px] leading-[1.45] text-pqText text-balance">
            {premiumNotice}
          </div>
        </FormSection>
      )}

      <FormChoice
        name="post_type"
        label={t('label_post_type', 'Post type')}
        layout="segment"
        defaultValue="post"
        options={postTypes}
      />

      {postType === 'article' ? (
        <>
          <Input
            label={t('label_article_title', 'Article title')}
            placeholder={t('label_article_title', 'Article title')}
            {...register('article_title')}
          />
          <FormChoice
            name="article_status"
            icon="status"
            label={t('label_article_status', 'Article status')}
            layout="segment"
            defaultValue="draft"
            options={[
              {
                value: 'draft',
                label: t('label_article_status_draft', 'Save as draft'),
              },
              {
                value: 'published',
                label: t('label_article_status_published', 'Publish'),
              },
            ]}
          />
          <MediaComponent
            type="image"
            label={t('label_article_cover', 'Cover image')}
            description={t(
              'description_article_cover',
              'Cover picture for the article (optional)'
            )}
            {...register('article_cover')}
          />
        </>
      ) : (
        <>
          <FormChoice
            name="who_can_reply_post"
            icon="reply"
            label={t(
              'label_who_can_reply_to_this_post',
              'Who can reply to this post?'
            )}
            defaultValue="everyone"
            options={whoCanReply}
          />

          <Input
            label={t('label_community', 'Community')}
            placeholder="https://x.com/i/communities/…"
            {...register('community')}
          />

          <div className="flex flex-col gap-[10px]">
            <Checkbox
              icon="ai"
              label={t('label_made_with_ai', 'Made with AI')}
              defaultValue={false}
              {...register('made_with_ai')}
            />
            <Checkbox
              icon="partnership"
              label={t('label_paid_partnership', 'Paid partnership')}
              defaultValue={false}
              {...register('paid_partnership')}
            />
          </div>

          <ThreadFinisher />
        </>
      )}
    </>
  );
};

export default withProvider({
  imageOrientation: 'landscape',
  postComment: PostComment.POST,
  minimumCharacters: [],
  SettingsComponent: SettingsComponent,
  CustomPreviewComponent: undefined,
  dto: XDto,
  maximumCharacters: (settings) => {
    // The server's `maxLength` holds an account X said has no subscription to
    // 280 whatever the switch says, so the counter does too.
    if (settings?.[0]?.value && settings?.[0]?.subscriptionType !== 'None') {
      return 4000;
    }
    return 280;
  },
});
