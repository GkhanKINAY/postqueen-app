'use client';

import { FC } from 'react';
import clsx from 'clsx';

const Spinner: FC<{
  type?: string;
  color?: string;
  width?: number;
  height?: number;
}> = ({ color = '#612bd3', width = 100, height = 100 }) => {
  const size = Math.min(width, height);
  const borderWidth = Math.max(2, Math.round(size / 8));

  return (
    <div
      style={{
        width: size,
        height: size,
        border: `${borderWidth}px solid transparent`,
        borderTopColor: color,
        borderRadius: '50%',
        animation: 'spin 0.8s linear infinite',
      }}
    />
  );
};

export { Spinner as default };

const Bone = ({ className }: { className?: string }) => (
  <div
    className={clsx('animate-pulse rounded-[8px] bg-pqHover', className)}
    aria-hidden
  />
);

/**
 * In-page loading ghost used while a route's own data is still resolving
 * (integrations list, analytics, plugs, billing…). Prefer this over a lone
 * spinner so the chrome already on screen keeps feeling occupied.
 */
export const PageContentSkeleton: FC<{ className?: string }> = ({
  className,
}) => (
  <div
    role="status"
    aria-busy="true"
    aria-label="Loading"
    className={clsx(
      'flex min-h-0 flex-1 flex-col gap-[14px] bg-pqInner p-[20px] mobile:p-[14px]',
      className
    )}
  >
    <div className="flex items-center gap-[8px]">
      <Bone className="h-[32px] w-[140px] rounded-[9px]" />
      <Bone className="h-[32px] w-[96px] rounded-[9px]" />
      <div className="flex-1" />
      <Bone className="h-[32px] w-[120px] rounded-[9px]" />
    </div>
    <div className="flex min-h-0 flex-1 gap-[1px] overflow-hidden rounded-[12px] bg-pqLine">
      <div className="flex w-[min(260px,34%)] shrink-0 flex-col gap-[8px] bg-pqInner p-[12px]">
        <Bone className="h-[14px] w-[48%]" />
        <Bone className="h-[36px] w-full rounded-[9px]" />
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="flex items-center gap-[10px] rounded-pqSm p-[8px]"
          >
            <Bone className="size-[28px] shrink-0 rounded-full" />
            <div className="flex min-w-0 flex-1 flex-col gap-[6px]">
              <Bone className="h-[11px] w-[70%]" />
              <Bone className="h-[10px] w-[45%]" />
            </div>
          </div>
        ))}
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-[12px] bg-pqInner p-[16px]">
        <Bone className="h-[18px] w-[28%]" />
        <Bone className="h-[12px] w-[52%]" />
        <div className="mt-[4px] grid grid-cols-2 gap-[12px] tablet:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="flex flex-col gap-[10px] rounded-[12px] bg-pqSettings p-[14px]"
            >
              <Bone className="h-[12px] w-[40%]" />
              <Bone className="h-[28px] w-[55%]" />
              <Bone className="h-[10px] w-[80%]" />
            </div>
          ))}
        </div>
        <div className="mt-[8px] flex flex-col gap-[8px]">
          {Array.from({ length: 4 }).map((_, i) => (
            <Bone key={i} className="h-[44px] w-full rounded-[10px]" />
          ))}
        </div>
      </div>
    </div>
  </div>
);

export const LoadingComponent: FC<{
  width?: number;
  height?: number;
  /** Keep the classic centered spinner (third-party embeds, tiny slots). */
  spinner?: boolean;
}> = (props) => {
  if (props.spinner || props.width || props.height) {
    return (
      <div className="flex flex-1 justify-center pt-[100px]">
        <Spinner
          color="#612bd3"
          width={props.width || 100}
          height={props.height || 100}
        />
      </div>
    );
  }

  return <PageContentSkeleton />;
};
