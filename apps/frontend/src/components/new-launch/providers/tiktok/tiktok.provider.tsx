'use client';

import {
  FC,
  useCallback,
  useEffect,
  useMemo,
  useRef,
} from 'react';
import useSWR from 'swr';
import {
  PostComment,
  withProvider,
} from '@gitroom/frontend/components/new-launch/providers/high.order.provider';
import { TikTokDto } from '@gitroom/nestjs-libraries/dtos/posts/providers-settings/tiktok.dto';
import { useSettings } from '@gitroom/frontend/components/launches/helpers/use.values';
import { Select } from '@gitroom/react/form/select';
import { FormChoice } from '@gitroom/react/form/form.choice';
import { FormSection } from '@gitroom/react/form/form.section';
import { FormIcon, type FormIconName } from '@gitroom/react/form/form.icon';
import { Checkbox } from '@gitroom/react/form/checkbox';
import clsx from 'clsx';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { useIntegration } from '@gitroom/frontend/components/launches/helpers/use.integration';
import { Input } from '@gitroom/react/form/input';
import { Skeleton } from '@gitroom/react/ui/skeleton';
import { useCustomProviderFunction } from '@gitroom/frontend/components/launches/helpers/use.custom.provider.function';
import { TiktokPreview } from '@gitroom/frontend/components/new-launch/providers/tiktok/tiktok.preview';
import { TikTokMusicSelector } from '@gitroom/frontend/components/new-launch/providers/tiktok/tiktok.music';
import { TikTokLocationSelector } from '@gitroom/frontend/components/new-launch/providers/tiktok/tiktok.location';

type TikTokCreatorInfo = {
  privacyLevelOptions: string[];
  maxDurationSeconds?: number;
  commentDisabled: boolean;
  duetDisabled: boolean;
  stitchDisabled: boolean;
};

/**
 * TikTok's own answer for what this creator may post right now.
 *
 * Its own hook around one SWR call, so `rules-of-hooks` is satisfied without an
 * eslint-disable.
 *
 * The throw is load-bearing. `/integrations/function` answers HTTP 200 with a
 * body of `false` when the provider call fails, and `useCustomProviderFunction`
 * never throws on a bad status either - its guard reads
 * `status > 299 && status < 200`, which cannot be true. So a failure arrives
 * here looking exactly like a success carrying nothing, and SWR would report it
 * as loaded-and-empty. Checking the shape and throwing is what gives SWR an
 * `error` to tell the two apart, the same reason `use.integration.list.tsx`
 * throws on a non-ok response.
 *
 * No `keepPreviousData`: the key carries an integration id, and one channel's
 * permissions shown under another channel's name would be wrong data rather
 * than a stale view.
 */
const useTikTokCreatorInfo = (integrationId?: string) => {
  const call = useCustomProviderFunction();
  const get = call.get;

  const load = useCallback(async () => {
    const info = await get('creatorInfo');
    if (!info || !Array.isArray(info.privacyLevelOptions)) {
      throw new Error('TikTok did not answer with creator info');
    }

    return info as TikTokCreatorInfo;
  }, [get]);

  return useSWR(
    integrationId ? `tiktok-creator-info-${integrationId}` : null,
    load,
    {
      refreshWhenHidden: false,
      refreshWhenOffline: false,
      revalidateOnFocus: false,
      revalidateIfStale: false,
      revalidateOnMount: true,
      revalidateOnReconnect: false,
      refreshInterval: 0,
    }
  );
};

/**
 * Label and glyph for each value TikTok can return in `privacy_level_options`.
 * The mapping lives here rather than in `FormChoice`, because which privacy
 * levels exist is TikTok's business and generic form components must not know
 * a provider's vocabulary.
 */
const PRIVACY_ICONS: Record<string, FormIconName> = {
  PUBLIC_TO_EVERYONE: 'globe',
  MUTUAL_FOLLOW_FRIENDS: 'users',
  FOLLOWER_OF_CREATOR: 'user',
  SELF_ONLY: 'lock',
};

const TikTokSettings: FC<{
  values?: any;
}> = (props) => {
  const { watch, register, setValue } = useSettings();
  const { value, integration } = useIntegration();
  const t = useT();

  // Music and location come from the Business API (v1.3) - the legacy Content
  // Posting API used by the "tiktok" identifier has no such fields.
  const isBusiness = integration?.identifier === 'tiktok-business';

  const isTitle = useMemo(() => {
    return value?.[0]?.image?.some((p) => (p?.path?.indexOf?.('mp4') ?? -1) === -1);
  }, [value]);

  const hasMedia = (value?.[0]?.image?.length ?? 0) > 0;
  const isVideo = hasMedia && !isTitle;

  const disclose = watch('disclose');
  const autoAddMusic = watch('autoAddMusic');
  const brand_organic_toggle = watch('brand_organic_toggle');
  const brand_content_toggle = watch('brand_content_toggle');
  const content_posting_method = watch('content_posting_method');
  const isUploadMode = content_posting_method === 'UPLOAD';

  // TikTok ignores every setting except the title / content when the posting
  // method is UPLOAD, so we hide them rather than pretend they apply. The fields
  // stay mounted and registered: their values must survive the switch, and
  // TikTokDto still requires most of them at save time.
  const directPostOnly = clsx(isUploadMode && 'invisible h-0 overflow-hidden');

  const tiktokRestrictionNotice = useMemo(() => {
    if (!hasMedia || !isVideo) return null;
    if (!isUploadMode) {
      return t(
        'tiktok_restriction_direct_video',
        'TikTok restriction: For direct post with video, your post content is used as the title. A separate title field is not available.'
      );
    }
    return t(
      'tiktok_restriction_upload_video',
      'TikTok restriction: For upload-only video, TikTok does not accept a title or message. The content will default to "#PostQueen" and you can edit it inside the TikTok app before publishing.'
    );
  }, [hasMedia, isUploadMode, isVideo, t]);

  const privacy_level = watch('privacy_level');
  const {
    data: creatorInfo,
    isLoading: creatorInfoLoading,
    error: creatorInfoError,
    mutate: retryCreatorInfo,
  } = useTikTokCreatorInfo(integration?.id);

  const privacyLabels: Record<string, string> = useMemo(
    () => ({
      PUBLIC_TO_EVERYONE: t('public_to_everyone', 'Public to everyone'),
      MUTUAL_FOLLOW_FRIENDS: t('mutual_follow_friends', 'Mutual follow friends'),
      FOLLOWER_OF_CREATOR: t('follower_of_creator', 'Follower of creator'),
      SELF_ONLY: t('self_only', 'Self only'),
    }),
    [t]
  );

  // Only what TikTok said this creator may use, in the order TikTok listed it.
  //
  // The list describes the ACCOUNT, not this app: measured against a live token,
  // a private account answered
  // `['FOLLOWER_OF_CREATOR','MUTUAL_FOLLOW_FRIENDS','SELF_ONLY']` — no
  // `PUBLIC_TO_EVERYONE`, because a private account cannot post publicly. The
  // fixed list of four therefore offered a level the platform would refuse, and
  // building the control from the API is a Content Sharing Guidelines
  // requirement besides.
  //
  // It does not cover the app's audit gate, which `creator_info` says nothing
  // about: an unaudited app is refused anything but SELF_ONLY at publish time
  // even when this list offered it. `handleErrors` names that case.
  //
  // Branded content cannot be private - TikTok answers
  // `privacy_level_option_mismatch` for that pair - so the toggle removes the
  // option rather than letting the publish fail.
  const privacyLevel = useMemo(() => {
    return (creatorInfo?.privacyLevelOptions ?? [])
      .filter((option) => !(brand_content_toggle && option === 'SELF_ONLY'))
      .map((option) => ({
        value: option,
        label: privacyLabels[option] || option,
        icon: PRIVACY_ICONS[option],
      }));
  }, [creatorInfo, brand_content_toggle, privacyLabels]);

  // Nothing is preselected: the guidelines want the creator to choose, and
  // `FormChoice` registers a `defaultValue` during render, before the options
  // could have arrived anyway. One case still needs a write.
  //
  // UPLOAD discards privacy entirely — `buildTikokPostInfoBody` does not even
  // put the field in the request — but `TikTokDto` keeps it required on
  // purpose, because existing API clients depend on that. So UPLOAD carries the
  // most conservative inert value.
  //
  // Only the UPLOAD → DIRECT_POST *transition* clears it, which is why the
  // previous mode is tracked rather than the value inspected: a creator who
  // deliberately chose Self only for a direct post must keep it.
  const wasUploadMode = useRef(isUploadMode);
  useEffect(() => {
    const leftUploadMode = wasUploadMode.current && !isUploadMode;
    wasUploadMode.current = isUploadMode;

    if (isUploadMode) {
      if (!privacy_level) {
        setValue('privacy_level', 'SELF_ONLY');
      }
      return;
    }

    if (leftUploadMode) {
      setValue('privacy_level', '');
    }
  }, [isUploadMode, privacy_level, setValue]);

  // TikTok reports the creator's own account-level switches. A creator who
  // turned comments off must not be offered a control that turns them back on,
  // and sending `disable_comment: false` for such an account is a publish TikTok
  // rejects — the same class of after-the-fact failure as the privacy list.
  const duetOff = !!creatorInfo?.duetDisabled;
  const stitchOff = !!creatorInfo?.stitchDisabled;
  const commentOff = !!creatorInfo?.commentDisabled;

  useEffect(() => {
    if (duetOff) {
      setValue('duet', false);
    }
    if (stitchOff) {
      setValue('stitch', false);
    }
    if (commentOff) {
      setValue('comment', false);
    }
  }, [duetOff, stitchOff, commentOff, setValue]);

  // Named, because a control that is simply greyed out tells the creator
  // nothing about why.
  const accountDisabledNotice = useMemo(() => {
    const off = [
      duetOff ? t('label_duet', 'Allow Duet') : '',
      stitchOff ? t('label_stitch', 'Allow Stitch') : '',
      commentOff ? t('label_comments', 'Allow Comments') : '',
    ].filter((p) => p);

    if (!off.length) {
      return null;
    }

    return t(
      'tiktok_disabled_on_account',
      'Turned off on your TikTok account, so it cannot be set here'
    ) + `: ${off.join(', ')}`;
  }, [duetOff, stitchOff, commentOff, t]);

  // A choice that TikTok has since withdrawn — most often SELF_ONLY after
  // branded content was switched on — must not stay selected and be submitted.
  useEffect(() => {
    if (isUploadMode || !privacy_level || !creatorInfo) {
      return;
    }

    if (!privacyLevel.some((option) => option.value === privacy_level)) {
      setValue('privacy_level', '');
    }
  }, [isUploadMode, privacy_level, creatorInfo, privacyLevel, setValue]);
  const contentPostingMethod = [
    {
      value: 'DIRECT_POST',
      label: t(
        'post_content_directly_to_tiktok',
        'Post content directly to TikTok'
      ),
    },
    {
      value: 'UPLOAD',
      label: t(
        'upload_content_to_tiktok_without_posting',
        'Upload content to TikTok without posting it'
      ),
    },
  ];
  const yesNo = [
    {
      value: 'yes',
      label: t('yes', 'Yes'),
    },
    {
      value: 'no',
      label: t('no', 'No'),
    },
  ];

  return (
    <div className="flex flex-col gap-[12px]">
      {tiktokRestrictionNotice && (
        <FormSection icon="warn">
          <div className="text-[13px] leading-[1.45] text-pqText text-balance">
            {tiktokRestrictionNotice}
          </div>
        </FormSection>
      )}
      {isTitle && (
        <Input
          label="Title"
          placeholder="Video title"
          {...register('title')}
          maxLength={89}
        />
      )}
      <div className={directPostOnly}>
        <FormSection>
          {creatorInfoLoading && !creatorInfo ? (
            // A bone per row of the control it replaces: the label line, then
            // the pill track. A spinner here would promise nothing about the
            // shape that is coming.
            <div className="flex flex-col gap-[5px]">
              <Skeleton className="h-[16px] w-[160px]" />
              <Skeleton className="h-[32px] w-full max-w-[420px]" />
            </div>
          ) : creatorInfoError ? (
            // No guessed fallback list. Offering a level TikTok has not
            // approved is the exact failure this change exists to remove, so a
            // failed lookup says so and offers another go.
            <div className="flex flex-col gap-[6px]">
              <div className="flex items-center gap-[8px] text-[13px] font-[500] text-pqMuted">
                <FormIcon name="visibility" size={15} className="text-pqSoft" />
                {t('label_who_can_see_this_video', 'Who can see this video?')}
              </div>
              <div className="text-[12px] leading-[1.45] text-pqDanger text-balance">
                {t(
                  'tiktok_privacy_options_failed',
                  'Could not load who can see this video from TikTok. Without it we cannot know which privacy levels your account is allowed to use.'
                )}
              </div>
              <button
                type="button"
                onClick={() => retryCreatorInfo()}
                className="w-fit text-[12px] font-[600] text-pqFocused hover:underline"
              >
                {t('try_again', 'Try again')}
              </button>
            </div>
          ) : privacyLevel.length ? (
            <div className="flex flex-col gap-[5px]">
              <FormChoice
                name="privacy_level"
                icon="visibility"
                label={t(
                  'label_who_can_see_this_video',
                  'Who can see this video?'
                )}
                disabled={isUploadMode}
                options={privacyLevel}
              />
              {!privacy_level && (
                <div className="text-[12px] leading-[1.45] text-pqDanger">
                  {t(
                    'tiktok_privacy_required',
                    'Choose who can see this video before scheduling.'
                  )}
                </div>
              )}
            </div>
          ) : (
            // Reachable when branded content has removed the only level the
            // account had left - a private account whose one remaining option
            // was SELF_ONLY, which branded content is not allowed to use.
            <div className="flex flex-col gap-[6px]">
              <div className="flex items-center gap-[8px] text-[13px] font-[500] text-pqMuted">
                <FormIcon name="visibility" size={15} className="text-pqSoft" />
                {t('label_who_can_see_this_video', 'Who can see this video?')}
              </div>
              <div className="text-[12px] leading-[1.45] text-pqDanger text-balance">
                {brand_content_toggle
                  ? t(
                      'tiktok_privacy_none_with_branded',
                      'TikTok does not allow branded content to be private, and this account has no other privacy level available. Turn Branded content off to post this.'
                    )
                  : t(
                      'tiktok_privacy_none',
                      'TikTok did not offer any privacy level for this account, so this video cannot be posted directly.'
                    )}
              </div>
            </div>
          )}
        </FormSection>
      </div>
      <FormSection
        hint={t(
          'choose_upload_without_posting_description',
          `Choose upload without posting if you want to review and edit your content within TikTok's app before publishing.
        This gives you access to TikTok's built-in editing tools and lets you make final adjustments before posting. The additional settings are only available when posting directly to TikTok.`
        )}
      >
        <Select
          icon="upload"
          defaultValue="DIRECT_POST"
          label={t('label_content_posting_method', 'Content posting method')}
          {...register('content_posting_method', {
            value: 'DIRECT_POST',
          })}
        >
          <option value="">{t('select', 'Select')}</option>
          {contentPostingMethod.map((item) => (
            <option key={item.value} value={item.value}>
              {item.label}
            </option>
          ))}
        </Select>
        {isUploadMode && (
          <div className="text-[12px] leading-[1.45] text-pqDanger">
            After posting you fill find a notification inside your Inbox about
            your post (not content studio)
          </div>
        )}
      </FormSection>
      <div className={clsx('flex flex-col gap-[12px]', directPostOnly)}>
        <FormSection>
          <FormChoice
            name="autoAddMusic"
            icon="music"
            label={
              isBusiness
                ? t('label_add_random_music', 'Add random music')
                : t('label_auto_add_music', 'Auto add music')
            }
            layout="segment"
            disabled={isUploadMode}
            defaultValue="no"
            options={yesNo}
            hint={
              isBusiness
                ? t(
                    'tiktok_random_music_only_for_photos',
                    "This feature is available only for photos, it adds a random trending track from TikTok's commercial music library."
                  )
                : t(
                    'this_feature_available_only_for_photos',
                    'This feature available only for photos, it will add a default music that\n        you can change later.'
                  )
            }
          />
          {isBusiness && (
            <div className="flex flex-col gap-[12px]">
              {/* Random music replaces a manual choice for photos, so the
                  selector is hidden (but stays registered) while it's on. */}
              <div
                className={clsx(
                  !isVideo &&
                    autoAddMusic === 'yes' &&
                    'invisible h-0 overflow-hidden'
                )}
              >
                <TikTokMusicSelector
                  label={t('tiktok_music_label', 'Music')}
                  showVolumes={isVideo}
                  {...register('music')}
                />
              </div>
              <TikTokLocationSelector
                label={t('tiktok_location_label', 'Location')}
                {...register('location')}
              />
            </div>
          )}
        </FormSection>
        <FormSection
          icon="post"
          title={t('tiktok_video_features', 'Video features')}
        >
          <div className="flex flex-wrap gap-x-[20px] gap-y-[12px]">
            <Checkbox
              variant="hollow"
              icon="duet"
              label={t('label_duet', 'Allow Duet')}
              disabled={isUploadMode || duetOff}
              defaultValue={false}
              {...register('duet', {
                value: false,
              })}
            />
            <Checkbox
              icon="stitch"
              label={t('label_stitch', 'Allow Stitch')}
              variant="hollow"
              disabled={isUploadMode || stitchOff}
              defaultValue={false}
              {...register('stitch', {
                value: false,
              })}
            />
            <Checkbox
              icon="ai"
              label={t('video_made_with_ai', 'Video made with AI')}
              variant="hollow"
              disabled={isUploadMode}
              defaultValue={false}
              {...register('video_made_with_ai', {
                value: false,
              })}
            />
          </div>
          {accountDisabledNotice && (
            <div className="text-[12px] leading-[1.45] text-pqMuted text-balance">
              {accountDisabledNotice}
            </div>
          )}
        </FormSection>
        <FormSection>
          <div className="flex flex-col gap-[14px]">
            <Checkbox
              icon="comments"
              label={t('label_comments', 'Allow Comments')}
              variant="hollow"
              disabled={isUploadMode || commentOff}
              defaultValue={true}
              {...register('comment', {
                value: true,
              })}
            />
            <Checkbox
              variant="hollow"
              label={t('label_disclose_video_content', 'Disclose Video Content')}
              disabled={isUploadMode}
              defaultValue={false}
              {...register('disclose', {
                value: false,
              })}
            />
            {disclose && (
              <div className="flex items-start gap-[10px] rounded-[8px] bg-pqBrandFaint p-[10px] text-[13px] leading-[1.45] text-pqText">
                <FormIcon name="warn" className="mt-[2px] text-pqBrand" />
                <div>
                  {t(
                    'your_video_will_be_labeled_promotional',
                    'Your video will be labeled "Promotional Content".'
                  )}
                  <br />
                  {t(
                    'this_cannot_be_changed_once_posted',
                    'This cannot be changed once your video is posted.'
                  )}
                </div>
              </div>
            )}
            <div className="text-[12px] leading-[1.45] text-pqMuted text-balance">
              {t(
                'turn_on_to_disclose_video_promotes',
                'Turn on to disclose that this video promotes goods or services in\n          exchange for something of value. You video could promote yourself, a\n          third party, or both.'
              )}
            </div>
          </div>
          <div
            className={clsx(
              !disclose && 'invisible h-0 overflow-hidden',
              'flex flex-col gap-[10px]'
            )}
          >
            <Checkbox
              variant="hollow"
              icon="user"
              label={t('label_your_brand', 'Your brand')}
              disabled={isUploadMode}
              defaultValue={false}
              {...register('brand_organic_toggle', {
                value: false,
              })}
            />
            <div className="text-balance text-[12px] leading-[1.45] text-pqMuted">
              {t(
                'you_are_promoting_yourself',
                'You are promoting yourself or your own brand.'
              )}
              <br />
              {t(
                'this_video_will_be_classified_brand_organic',
                'This video will be classified as Brand Organic.'
              )}
            </div>
            <Checkbox
              variant="hollow"
              icon="partnership"
              label={t('label_branded_content', 'Branded content')}
              disabled={isUploadMode}
              defaultValue={false}
              {...register('brand_content_toggle', {
                value: false,
              })}
            />
            <div className="text-balance text-[12px] leading-[1.45] text-pqMuted">
              {t(
                'you_are_promoting_another_brand',
                'You are promoting another brand or a third party.'
              )}
              <br />
              {t(
                'this_video_will_be_classified_branded_content',
                'This video will be classified as Branded Content.'
              )}
            </div>
            {(brand_organic_toggle || brand_content_toggle) && (
              <div className="text-[12px] leading-[1.45] text-pqMuted text-balance">
                {t(
                  'by_posting_you_agree_to_tiktoks',
                  "By posting, you agree to TikTok's"
                )}{' '}
                {[
                  brand_organic_toggle || brand_content_toggle ? (
                    <a
                      key="music"
                      target="_blank"
                      className="text-pqFocused hover:underline"
                      href="https://www.tiktok.com/legal/page/global/music-usage-confirmation/en"
                    >
                      {t(
                        'music_usage_confirmation',
                        'Music Usage Confirmation'
                      )}
                    </a>
                  ) : undefined,
                  brand_content_toggle ? (
                    <span key="and"> {t('and', 'and')} </span>
                  ) : undefined,
                  brand_content_toggle ? (
                    <a
                      key="brand"
                      target="_blank"
                      className="text-pqFocused hover:underline"
                      href="https://www.tiktok.com/legal/page/global/bc-policy/en"
                    >
                      {t('branded_content_policy', 'Branded Content Policy')}
                    </a>
                  ) : undefined,
                ].filter((f) => f)}
              </div>
            )}
          </div>
        </FormSection>
      </div>
    </div>
  );
};
export default withProvider({
  postComment: PostComment.COMMENT,
  minimumCharacters: [],
  SettingsComponent: TikTokSettings,
  comments: false,
  CustomPreviewComponent: TiktokPreview,
  dto: TikTokDto,
  maximumCharacters: 2000,
});
