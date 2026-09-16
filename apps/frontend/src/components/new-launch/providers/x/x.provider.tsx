'use client';

import {
  PostComment,
  withProvider,
} from '@gitroom/frontend/components/new-launch/providers/high.order.provider';
import { ThreadFinisher } from '@gitroom/frontend/components/new-launch/finisher/thread.finisher';
import { FormChoice } from '@gitroom/react/form/form.choice';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { useSettings } from '@gitroom/frontend/components/launches/helpers/use.values';
import { XDto } from '@gitroom/nestjs-libraries/dtos/posts/providers-settings/x.dto';
import { Input } from '@gitroom/react/form/input';
import { Checkbox } from '@gitroom/react/form/checkbox';
import { MediaComponent } from '@gitroom/frontend/components/media/media.component';

const whoCanReply = [
  {
    label: 'Everyone',
    value: 'everyone',
    icon: 'globe' as const,
  },
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
];

const SettingsComponent = () => {
  const t = useT();
  const { register, watch } = useSettings();
  const postType = watch('post_type') || 'post';

  return (
    <>
      <FormChoice
        name="post_type"
        icon="type"
        label={t('label_post_type', 'Post type')}
        layout="segment"
        defaultValue="post"
        options={[
          { value: 'post', label: t('label_post_type_post', 'Post'), icon: 'post' },
          {
            value: 'article',
            label: t('label_post_type_article', 'Article (long-form)'),
            icon: 'article',
          },
        ]}
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
  postComment: PostComment.POST,
  minimumCharacters: [],
  SettingsComponent: SettingsComponent,
  CustomPreviewComponent: undefined,
  dto: XDto,
  maximumCharacters: (settings) => {
    if (settings?.[0]?.value) {
      return 4000;
    }
    return 280;
  },
});
