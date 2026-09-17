'use client';

// The right 55% of the auth split-screen. `'insights'` is a large still of
// the analytics workspace; `'app'` is the calendar still; `'calendar'` is
// the README illustration (`public/auth/calendar.svg`). Flip the constant
// to restore a still — do not delete the PNG or the SVG.
import { useT } from '@gitroom/react/translation/get.transation.service.client';

/** `'app'` / `'calendar'` restore the product stills. */
const SHOWCASE_STILL: 'insights' | 'app' | 'calendar' = 'insights';

const STILLS = {
  app: {
    src: '/auth/app-preview.png',
    width: 1920,
    height: 1080,
    // Bigger than the panel; overflow-hidden on the aside crops the right.
    className:
      'h-full min-h-[360px] w-auto min-w-[155%] max-w-none object-cover object-left ring-1 ring-white/15 drop-shadow-[0_28px_60px_rgba(12,6,32,0.55)]',
  },
  calendar: {
    src: '/auth/calendar.svg',
    width: 660,
    height: 430,
    className: 'w-full max-w-[660px] drop-shadow-[0_28px_60px_rgba(12,6,32,0.55)]',
  },
} as const;

const CHANNELS = [
  'instagram',
  'x',
  'linkedin',
  'youtube',
  'tiktok',
  'facebook',
  'threads',
  'pinterest',
  'reddit',
  'discord',
];

const PREVIEW_POSTS = [
  {
    title: 'What we shipped this week',
    metric: '128',
    comments: '16',
    rate: '4.2%',
    impressions: '12.4k',
    platform: 'x',
  },
  {
    title: 'A thread on the new design system',
    metric: '96',
    comments: '11',
    rate: '3.8%',
    impressions: '8.1k',
    platform: 'linkedin',
  },
  {
    title: 'How we cut publishing time by 62%',
    metric: '74',
    comments: '9',
    rate: '3.1%',
    impressions: '6.6k',
    platform: 'instagram',
  },
] as const;

/** 3 in a row stays readable at ~1280; 4-up truncates to crumbs. */
const PREVIEW_TOP = PREVIEW_POSTS.slice(0, 3);
const PREVIEW_ROWS = PREVIEW_TOP;

const PREVIEW_TABLE_COLUMNS =
  'minmax(0,1.8fr) minmax(56px,0.4fr) minmax(56px,0.4fr) minmax(52px,0.35fr) minmax(64px,0.45fr)';

/** Dummy still: a single 40px platform mark. Real PostThumb overlays a pip on
 *  a post photo; here the photo *is* the icon, so a pip would print Instagram
 *  twice. Assets are 50×50 — keep display at 40 so they are not upscaled. */
const PreviewThumb = ({
  platform,
  size = 40,
}: {
  platform: string;
  size?: 28 | 32 | 40;
}) => (
  <span
    className="flex shrink-0 items-center justify-center overflow-hidden rounded-[8px] bg-pqSettings"
    style={{ width: size, height: size }}
  >
    <img
      src={`/icons/platforms/${platform}.png`}
      alt=""
      width={size}
      height={size}
      className="object-contain"
      style={{ width: size, height: size }}
    />
  </span>
);

const POSTING_DAY_HEIGHTS = [88, 22, 46, 14, 58, 8, 34];

const Wash = () => (
  <>
    <div
      aria-hidden="true"
      className="absolute inset-0"
      style={{
        backgroundImage:
          'radial-gradient(115% 85% at 12% 0%, #8b5cf6 0%, #6d28d9 30%, #3d1a7a 62%, #1c0e37 100%)',
      }}
    />
    <div
      aria-hidden="true"
      className="absolute inset-[-30%] opacity-[0.12]"
      style={{
        backgroundImage:
          'linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)',
        backgroundSize: '64px 64px',
        transform: 'rotate(-14deg)',
      }}
    />
  </>
);

const AnalyticsPreview = () => {
  const t = useT();
  const days = [
    t('dow_mon', 'Mon'),
    t('dow_tue', 'Tue'),
    t('dow_wed', 'Wed'),
    t('dow_thu', 'Thu'),
    t('dow_fri', 'Fri'),
    t('dow_sat', 'Sat'),
    t('dow_sun', 'Sun'),
  ];

  return (
    <div
      className="dark relative min-h-0 w-full flex-1 overflow-hidden rounded-3xl bg-pqInner text-pqText shadow-[var(--e2)]"
      role="img"
      aria-label={t(
        'auth_showcase_alt',
        'Impressions, reactions and a top post from PostQueen analytics'
      )}
    >
      <div
        aria-hidden="true"
        className="flex h-full min-h-0 w-full flex-col gap-[12px] overflow-hidden p-[14px] 2xl:gap-[14px] 2xl:p-[18px]"
      >
        <div className="flex min-w-0 shrink-0 items-center justify-between gap-[12px]">
          <div className="min-w-0">
            <div className="font-display text-[18px] font-[600] text-pqText 2xl:text-[20px]">
              {t('all_channels', 'All channels')}
            </div>
            <div className="mt-[2px] hidden truncate text-[12.5px] text-pqMuted 2xl:block">
              {t(
                'analytics_lifetime_totals_hint',
                'Posts published in this period · current totals'
              )}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-[3px] rounded-pqSm bg-pqSettings p-[3px]">
            <span className="flex h-[28px] items-center rounded-[8px] bg-pqInner px-[12px] text-[13px] font-[600] text-pqText shadow-[inset_0_0_0_1px_var(--border)]">
              {t('range_7d', '7d')}
            </span>
            <span className="flex h-[28px] items-center px-[12px] text-[13px] font-[500] text-pqMuted">
              {t('range_30d', '30d')}
            </span>
            <span className="flex h-[28px] items-center px-[12px] text-[13px] font-[500] text-pqMuted">
              {t('range_90d', '90d')}
            </span>
          </div>
        </div>

        <section className="min-w-0 shrink-0 rounded-pqMd bg-pqPop p-[12px] shadow-[inset_0_0_0_1px_var(--border)] 2xl:p-[14px]">
          <div className="mb-[10px] flex min-w-0 items-center justify-between gap-[8px]">
            <div className="min-w-0 font-display text-[15px] font-[600] text-pqText 2xl:text-[16px]">
              {t('top_n_posts', 'Top {count} posts').replace(
                '{count}',
                String(PREVIEW_TOP.length)
              )}
            </div>
            <div className="flex shrink-0 items-center gap-[3px] rounded-pqSm bg-pqSettings p-[3px]">
              <span className="flex h-[26px] items-center rounded-[8px] bg-pqInner px-[10px] text-[12px] font-[600] text-pqText shadow-[inset_0_0_0_1px_var(--border)]">
                {t('reactions', 'Reactions')}
              </span>
              <span className="flex h-[26px] items-center px-[10px] text-[12px] font-[500] text-pqMuted">
                {t('comments', 'Comments')}
              </span>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-[8px] 2xl:gap-[10px]">
            {PREVIEW_TOP.map((post, index) => (
              <div
                key={post.title}
                className="flex min-w-0 flex-col gap-[8px] rounded-[10px] bg-pqInner p-[10px] shadow-[inset_0_0_0_1px_var(--border)]"
              >
                <div className="flex min-w-0 items-start justify-between gap-[6px]">
                  <div className="min-w-0 flex-1">
                    <div
                      className={
                        index === 0
                          ? 'text-[11px] font-[700] tabular-nums text-pqBrand'
                          : 'text-[11px] font-[700] tabular-nums text-pqMuted'
                      }
                    >
                      #{index + 1}
                    </div>
                    <div className="mt-[2px] line-clamp-2 text-[12.5px] leading-[1.35] text-pqText 2xl:text-[13px]">
                      {post.title}
                    </div>
                  </div>
                  <PreviewThumb platform={post.platform} size={28} />
                </div>
                <div className="truncate text-[14px] font-[600] tabular-nums text-pqText 2xl:text-[15px]">
                  {post.metric}
                  <span className="ms-[4px] text-[10.5px] font-[500] text-pqMuted 2xl:ms-[6px] 2xl:text-[11px]">
                    {t('reactions', 'Reactions')}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </section>

        <div className="grid min-w-0 shrink-0 grid-cols-2 gap-[10px] 2xl:gap-[12px]">
          <section className="flex min-w-0 flex-col rounded-pqMd bg-pqPop p-[12px] shadow-[inset_0_0_0_1px_var(--border)] 2xl:p-[14px]">
            <div className="shrink-0 font-display text-[14px] font-[600] text-pqText 2xl:text-[16px]">
              {t('posting_days', 'Posting days')}
            </div>
            <div className="mt-[2px] hidden shrink-0 text-[12.5px] text-pqMuted 2xl:block">
              {t('posting_days_hint', 'How many posts went out each weekday')}
            </div>
            <div className="mt-[8px] flex h-[56px] shrink-0 items-end gap-[6px] 2xl:mt-[10px] 2xl:h-[64px] 2xl:gap-[8px]">
              {POSTING_DAY_HEIGHTS.map((height, index) => (
                <div
                  key={days[index]}
                  className="flex h-full min-w-0 flex-1 flex-col items-center gap-[6px]"
                >
                  <div className="flex min-h-0 w-full flex-1 items-end">
                    <div
                      className="w-full rounded-[6px] bg-pqBrand"
                      style={{
                        height: `${height}%`,
                        opacity: height < 16 ? 0.22 : 1,
                      }}
                    />
                  </div>
                  <div className="shrink-0 text-[11px] font-[600] text-pqMuted">
                    {days[index]}
                  </div>
                </div>
              ))}
            </div>
          </section>
          <section className="flex min-w-0 flex-col rounded-pqMd bg-pqPop p-[12px] shadow-[inset_0_0_0_1px_var(--border)] 2xl:p-[14px]">
            <div className="shrink-0 font-display text-[14px] font-[600] text-pqText 2xl:text-[16px]">
              {t('engagement_mix', 'Engagement mix')}
            </div>
            <div className="mt-[2px] hidden shrink-0 text-[12.5px] text-pqMuted 2xl:block">
              {t(
                'engagement_mix_hint',
                'Known reactions vs comments on these posts'
              )}
            </div>
            <div className="mt-[10px] flex h-[10px] shrink-0 overflow-hidden rounded-full bg-pqSettings 2xl:mt-[12px] 2xl:h-[12px]">
              <div className="h-full w-[62%] bg-pqBrand" />
              <div className="h-full flex-1 bg-pqOk" />
            </div>
            <div className="mt-[10px] flex shrink-0 items-baseline justify-between gap-[8px] whitespace-nowrap text-[12px] 2xl:mt-[12px] 2xl:text-[13px]">
              <span className="min-w-0 truncate">
                <span className="text-[10px] font-[600] uppercase tracking-[0.06em] text-pqMuted 2xl:text-[11px]">
                  {t('reactions', 'Reactions')}
                </span>{' '}
                <span className="font-[600] tabular-nums text-pqText">62%</span>
              </span>
              <span className="min-w-0 truncate text-end">
                <span className="text-[10px] font-[600] uppercase tracking-[0.06em] text-pqMuted 2xl:text-[11px]">
                  {t('comments', 'Comments')}
                </span>{' '}
                <span className="font-[600] tabular-nums text-pqText">38%</span>
              </span>
            </div>
          </section>
        </div>

        <section className="min-w-0 shrink-0 overflow-hidden rounded-pqMd bg-pqPop shadow-[inset_0_0_0_1px_var(--border)]">
          <div className="px-[14px] pb-[6px] pt-[12px]">
            <div className="font-display text-[15px] font-[600] text-pqText 2xl:text-[16px]">
              {t('performance_per_post', 'Performance per post')}
            </div>
          </div>
          <div
            className="grid items-center gap-[8px] bg-pqTableHeader px-[14px] py-[8px] text-[11px] font-[700] uppercase tracking-[0.06em] text-pqMuted"
            style={{ gridTemplateColumns: PREVIEW_TABLE_COLUMNS }}
          >
            <span>{t('post', 'Post')}</span>
            <span className="text-end">{t('reactions', 'Reactions')}</span>
            <span className="text-end">{t('comments', 'Comments')}</span>
            <span className="text-end">{t('eng_rate', 'Eng. rate')}</span>
            <span className="text-end">{t('impressions', 'Impressions')}</span>
          </div>
          {PREVIEW_ROWS.map((row, index) => (
            <div
              key={row.title}
              className="grid items-center gap-[8px] border-t border-pqLine px-[14px] py-[10px] text-[13px]"
              style={{ gridTemplateColumns: PREVIEW_TABLE_COLUMNS }}
            >
              <span className="flex min-w-0 items-center gap-[8px] text-pqText">
                <PreviewThumb platform={row.platform} size={32} />
                <span className="min-w-0 truncate">{row.title}</span>
              </span>
              <span className="text-end tabular-nums text-pqText">
                {row.metric}
              </span>
              <span className="text-end tabular-nums text-pqText">
                {row.comments}
              </span>
              <span className="text-end tabular-nums text-pqText">
                {row.rate}
              </span>
              <span className="text-end tabular-nums text-pqText">
                {row.impressions}
              </span>
            </div>
          ))}
        </section>
      </div>
    </div>
  );
};

const InsightsCard = () => {
  const t = useT();

  return (
    <div className="relative flex h-full min-h-0 w-full flex-1 flex-col gap-[8px] overflow-hidden 2xl:gap-[10px]">
      <div className="shrink-0 px-[8px] text-center text-white">
        <span className="inline-flex rounded-[6px] bg-pqBrand px-[8px] py-[3px] text-[11px] font-[700] uppercase tracking-[0.08em] text-pqOnBrand">
          {t('new', 'NEW')}
        </span>
        <h2 className="mt-[4px] font-display text-balance text-[20px] font-[700] leading-[1.2] -tracking-[0.6px] 2xl:mt-[6px] 2xl:text-[28px]">
          {t('auth_showcase_title', 'Introducing Insights')}
        </h2>
      </div>
      <AnalyticsPreview />
      <p className="shrink-0 px-[8px] text-center text-[13px] font-[500] text-white/90">
        {t(
          'auth_showcase_channels',
          'Analytics that show you your next move'
        )}
      </p>
    </div>
  );
};

const StillShowcase = ({ still }: { still: 'app' | 'calendar' }) => {
  const t = useT();
  const image = STILLS[still];

  return (
    <div className="relative flex min-h-0 w-full flex-1 flex-col items-center gap-[20px] py-[36px] text-white">
      <div className="shrink-0 px-[32px] text-center">
        <h2 className="font-display text-balance text-[28px] font-[700] leading-[1.25] -tracking-[0.6px] xl:text-[32px]">
          {t('auth_showcase_title', 'Introducing Insights')}
        </h2>
      </div>

      <div className="flex min-h-0 w-full flex-1 items-stretch overflow-hidden ps-[20px]">
        <img
          src={image.src}
          width={image.width}
          height={image.height}
          alt={t(
            'auth_showcase_alt',
            'Impressions, reactions and a top post from PostQueen analytics'
          )}
          className={image.className}
        />
      </div>

      <div className="flex shrink-0 flex-col items-center gap-[14px] px-[32px]">
        <div className="flex items-center gap-[10px]">
          {CHANNELS.map((channel) => (
            <img
              key={channel}
              src={`/icons/platforms/${channel}.png`}
              alt=""
              aria-hidden="true"
              className="size-[30px] rounded-full ring-1 ring-inset ring-white/25"
            />
          ))}
        </div>
        <p className="text-[14px] font-[500] text-white/90">
          {t(
            'auth_showcase_channels',
            'Analytics that show you your next move'
          )}
        </p>
      </div>
    </div>
  );
};

export const ProductShowcase = () => {
  return (
    <aside className="relative hidden h-full min-h-0 w-[55%] shrink-0 overflow-hidden p-[16px] lg:flex lg:flex-col 2xl:p-[24px]">
      <Wash />
      {SHOWCASE_STILL === 'insights' ? (
        <InsightsCard />
      ) : (
        <StillShowcase still={SHOWCASE_STILL} />
      )}
    </aside>
  );
};
