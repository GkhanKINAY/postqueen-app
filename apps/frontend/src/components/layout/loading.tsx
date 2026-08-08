'use client';

import { FC, ReactNode } from 'react';
import clsx from 'clsx';
import { Skeleton } from '@gitroom/react/ui/skeleton';
import { Spinner } from '@gitroom/react/ui/spinner';
import { useT } from '@gitroom/react/translation/get.transation.service.client';

/**
 * Kept as this module's default export because six call sites import it from
 * here. New code should import `Spinner` from `@gitroom/react/ui/spinner`
 * directly; the only thing this adds is the legacy 100px default size.
 */
const PageSpinner: FC<{
  color?: string;
  width?: number;
  height?: number;
}> = ({ color, width = 100, height = 100 }) => (
  <Spinner color={color} width={width} height={height} />
);

export { PageSpinner as default };

/**
 * Plugs' detail pane: the `PlugItem` card grid, at the grid and card metrics
 * `plugs/plug.tsx:242-245` uses. Exported because `Plug` needs it on its own —
 * its per-channel fetch resolves after the page's, and it used to return
 * `null` in the gap, so the pane went ghost → blank → content.
 */
export const PlugsDetailGhost = () => (
  <div className="mx-auto grid w-full max-w-[1000px] grid-cols-[repeat(auto-fill,minmax(320px,1fr))] gap-[10px]">
    {Array.from({ length: 4 }).map((_, i) => (
      <div
        key={i}
        className="flex flex-col gap-[11px] rounded-pqMd bg-pqPop p-[15px_16px] shadow-[inset_0_0_0_1px_var(--border)]"
      >
        <div className="flex items-start gap-[11px]">
          <Skeleton className="size-[30px] shrink-0 rounded-[9px]" />
          <div className="flex min-w-0 flex-1 flex-col gap-[6px]">
            <Skeleton className="h-[14px] w-[52%]" />
            <Skeleton className="h-[12px] w-[38%]" />
          </div>
          <Skeleton className="h-[20px] w-[38px] shrink-0 rounded-full" />
        </div>
        <Skeleton className="h-[13px] w-[92%]" />
        <Skeleton className="h-[13px] w-[64%]" />
        <Skeleton className="h-[28px] w-[104px] self-start rounded-pqSm" />
      </div>
    ))}
  </div>
);

/**
 * Analytics' detail pane: range pills over the `AnalyticsCard` grid. Exported
 * so `render.analytics` can reuse the grid on its own, where the rail and the
 * pills are already on screen.
 */
export const AnalyticsCardsGhost: FC<{ pills?: boolean }> = ({
  pills = true,
}) => (
  <>
    {pills && (
      <div className="flex items-center gap-[8px]">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-[30px] w-[64px] rounded-[8px]" />
        ))}
      </div>
    )}
    <div className="grid grid-cols-1 gap-[13px] sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <div
          key={i}
          className="flex flex-col gap-[10px] rounded-[12px] bg-pqSettings p-[14px]"
        >
          <Skeleton className="h-[12px] w-[44%]" />
          <Skeleton className="h-[28px] w-[58%]" />
          <Skeleton className="h-[10px] w-[80%]" />
        </div>
      ))}
    </div>
  </>
);

/**
 * Ghost for the channel-column pages — Plugs and Analytics, which both return
 * the same `flex min-h-0 flex-1 gap-[1px] bg-pqLine` split. It stands in for
 * that whole row, so it replaces the page's `return`, not a slot inside it:
 * anything that centres it or re-applies the page's own padding collapses it.
 *
 * The detail pane differs per page, so it arrives as a slot; the default is
 * the settings stack Plugs shows. Do not reach for this on a page with no
 * channel column — a ghost rail beside a real one, or beside no rail at all,
 * is worse than a spinner.
 */
export const PageContentSkeleton: FC<{ detail?: ReactNode }> = ({ detail }) => (
  <div
    role="status"
    aria-busy="true"
    aria-label="Loading"
    className="relative flex min-h-0 flex-1 gap-[1px] bg-pqLine"
  >
    <div className="flex w-[260px] flex-[0_0_260px] flex-col bg-pqInner mobile:w-full mobile:flex-1">
      <div className="flex shrink-0 items-center gap-[8px] border-b border-pqLine p-[16px_14px_12px]">
        <Skeleton className="h-[12px] w-[76px]" />
        <Skeleton className="ms-auto size-[26px] rounded-[7px]" />
      </div>
      <div className="flex shrink-0 items-center p-[12px_12px_10px]">
        <Skeleton className="h-[36px] w-full rounded-[9px]" />
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-[2px] px-[8px] pb-[12px]">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="flex items-center gap-[10px] rounded-pqSm py-[7px] pe-[6px] ps-[9px]"
          >
            <Skeleton className="size-[32px] shrink-0 rounded-full" />
            <Skeleton
              className={clsx(
                'h-[12px]',
                i % 3 === 0 ? 'w-[68%]' : i % 3 === 1 ? 'w-[54%]' : 'w-[61%]'
              )}
            />
          </div>
        ))}
      </div>
    </div>

    <div className="flex min-w-0 flex-1 flex-col bg-pqInner mobile:hidden">
      <div className="flex shrink-0 items-center gap-[12px] border-b border-pqLine p-[16px_18px]">
        <Skeleton className="size-[38px] shrink-0 rounded-full" />
        <div className="flex min-w-0 flex-col gap-[7px]">
          <Skeleton className="h-[14px] w-[160px]" />
          <Skeleton className="h-[11px] w-[104px]" />
        </div>
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-[12px] p-[18px]">
        {detail ?? <PlugsDetailGhost />}
      </div>
    </div>
  </div>
);

export const LoadingComponent: FC<{
  width?: number;
  height?: number;
}> = (props) => {
  const t = useT();
  return (
    <div className="flex flex-1 items-center justify-center text-pqBrand">
      <Spinner
        width={props.width || 100}
        height={props.height || 100}
        label={t('loading', 'Loading')}
      />
    </div>
  );
};
