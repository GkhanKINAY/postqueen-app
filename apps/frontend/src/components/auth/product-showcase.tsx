'use client';

// Fills the right half of the auth split-screen with a light-theme product
// still — a sample week of scheduled posts. Ported from the landing site's
// app-mock / mocks-light (postqueen.ai) so the login screen previews the real
// calendar instead of the empty testimonial marquee that shipped here. Sample
// data only; no metrics or claims.

const DAY_START = 8;
const DAY_END = 20;

interface Chip {
  /** 24h clock, e.g. 9.25 is 9:15 */
  at: number;
  label: string;
  icon: string;
  tone: string;
}

interface Day {
  day: string;
  date: number;
  today?: boolean;
  chips: Chip[];
}

const ICON = (slug: string) => `/icons/platforms/${slug}.png`;

const TONE_BRAND = 'bg-btnPrimary/12 text-btnPrimary';
const TONE_BLUE = 'bg-[#5b7bd5]/12 text-[#5b7bd5]';
const TONE_POP = 'bg-ai/12 text-ai';

const WEEK: Day[] = [
  {
    day: 'Mon',
    date: 13,
    chips: [
      { at: 9.25, label: 'Launch teaser', icon: 'instagram', tone: TONE_BRAND },
      { at: 13.5, label: 'Feature thread', icon: 'x', tone: TONE_BLUE },
    ],
  },
  {
    day: 'Tue',
    date: 14,
    chips: [
      { at: 10.5, label: 'Behind the build', icon: 'tiktok', tone: TONE_POP },
      { at: 16, label: 'Community poll', icon: 'discord', tone: TONE_BRAND },
    ],
  },
  {
    day: 'Wed',
    date: 15,
    chips: [
      { at: 11.5, label: 'Customer story', icon: 'linkedin', tone: TONE_BRAND },
      { at: 15, label: 'AMA recap', icon: 'reddit', tone: TONE_BLUE },
    ],
  },
  {
    day: 'Thu',
    date: 16,
    chips: [
      { at: 10, label: 'Changelog', icon: 'threads', tone: TONE_BRAND },
      { at: 17.25, label: 'Clip of the week', icon: 'youtube', tone: TONE_POP },
    ],
  },
  {
    day: 'Fri',
    date: 17,
    today: true,
    chips: [
      { at: 10.5, label: 'Release notes', icon: 'instagram', tone: TONE_POP },
      { at: 15.5, label: 'Weekly recap', icon: 'linkedin', tone: TONE_BRAND },
    ],
  },
  {
    day: 'Sat',
    date: 18,
    chips: [{ at: 11, label: 'Tip of the day', icon: 'x', tone: TONE_BLUE }],
  },
  {
    day: 'Sun',
    date: 19,
    chips: [{ at: 12, label: 'Week ahead', icon: 'mastodon', tone: TONE_BRAND }],
  },
];

const HOURS = [9, 11, 13, 15, 17, 19];
const TOTAL = WEEK.reduce((n, d) => n + d.chips.length, 0);

const top = (at: number) => ((at - DAY_START) / (DAY_END - DAY_START)) * 100;

export const ProductShowcase = () => {
  return (
    <div className="w-full max-w-[760px] rounded-[20px] border border-newBorder bg-newBgColorInner overflow-hidden shadow-lg text-newTextColor">
      {/* window chrome */}
      <div className="flex items-center gap-[12px] border-b border-newBorder px-[16px] h-[48px]">
        <div className="flex gap-[6px]">
          <span className="w-[10px] h-[10px] rounded-full bg-newBgLineColor" />
          <span className="w-[10px] h-[10px] rounded-full bg-newBgLineColor" />
          <span className="w-[10px] h-[10px] rounded-full bg-newBgLineColor" />
        </div>
        <div className="text-[13px] font-[600]">Calendar</div>
        <div className="text-[12px] text-textItemBlur">July 2026</div>
        <div className="ms-auto rounded-[8px] bg-btnPrimary px-[12px] py-[6px] text-[11px] font-[600] text-white">
          + New Post
        </div>
      </div>

      {/* week grid */}
      <div className="flex h-[340px]">
        {/* hour gutter */}
        <div className="relative w-[44px] shrink-0 border-e border-newBorder">
          <div className="h-[28px] border-b border-newBorder" />
          <div className="relative h-[calc(100%-28px)]">
            {HOURS.map((h) => (
              <span
                key={h}
                style={{ top: `${top(h)}%` }}
                className="absolute end-[8px] -translate-y-1/2 text-[10px] text-textItemBlur"
              >
                {h > 12 ? h - 12 : h}
                {h >= 12 ? 'p' : 'a'}
              </span>
            ))}
          </div>
        </div>

        <div className="grid flex-1 grid-cols-7">
          {WEEK.map(({ day, date, today, chips }) => (
            <div key={day} className="min-w-0 border-e border-newBorder last:border-e-0">
              <div className="flex h-[28px] items-center justify-center gap-[6px] border-b border-newBorder text-[11px] font-[500] text-textItemBlur">
                {day}
                <span
                  className={
                    today
                      ? 'grid size-[18px] place-items-center rounded-full bg-btnPrimary text-[10px] font-[600] text-white'
                      : ''
                  }
                >
                  {date}
                </span>
              </div>
              <div className="relative h-[calc(100%-28px)]">
                {HOURS.map((h) => (
                  <span
                    key={h}
                    style={{ top: `${top(h)}%` }}
                    className="absolute inset-x-0 border-t border-newBorder/60"
                  />
                ))}
                {chips.map((c) => (
                  <div
                    key={c.label}
                    style={{ top: `${top(c.at)}%` }}
                    className={`absolute inset-x-[4px] flex items-center gap-[4px] rounded-[6px] px-[5px] py-[4px] text-[10px] font-[500] ${c.tone}`}
                  >
                    <img
                      src={ICON(c.icon)}
                      alt=""
                      className="size-[12px] shrink-0 rounded-[3px]"
                    />
                    <span className="truncate">{c.label}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* status bar */}
      <div className="flex items-center justify-between border-t border-newBorder px-[16px] py-[10px] text-[11px] text-textItemBlur">
        <span>{TOTAL} posts scheduled this week</span>
        <span className="hidden sm:inline">Drag a post to reschedule</span>
      </div>
    </div>
  );
};
