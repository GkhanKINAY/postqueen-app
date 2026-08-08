'use client';

import { clsx } from 'clsx';

/**
 * The one spinner. Use it for work with no shape to stand in for — a submit in
 * flight, a third-party embed booting. When the thing being waited on *does*
 * have a shape, reach for `Skeleton` instead: a ghost of the content beats a
 * ring, because it does not move the layout when the content lands.
 *
 * The app used to spell this four ways — this component, a byte-identical copy
 * inside the shared Button, nine hand-rolled `border-t-transparent` divs across
 * five colour tokens and three border widths, and one two-layer ring. Sizes ran
 * 15px to 250px.
 *
 * `color` defaults to `currentColor` so it inherits from whatever it sits in,
 * which is what a button and a scrim both want. `pq-loop` is the hook
 * `prefers-reduced-motion` switches the animation off with — see the note in
 * apps/frontend/src/app/global.scss. A stylesheet `!important` outranks the
 * non-important inline `animation` below, so the class works despite the
 * inline style.
 */
export const Spinner = ({
  color = 'currentColor',
  trackColor = 'transparent',
  width = 20,
  height = 20,
  borderWidth,
  className,
  label,
}: {
  color?: string;
  /**
   * The unlit part of the ring. Transparent by default — an arc. Give it a
   * value where the spinner sits on a busy surface and needs to read as a
   * ring, as the checkout does.
   */
  trackColor?: string;
  width?: number;
  height?: number;
  /**
   * Stroke. Derived from the size by default, which is right up to ~24px and
   * too heavy above it — a 48px ring wants 3, not 6.
   */
  borderWidth?: number;
  className?: string;
  /** Accessible name. Omit inside a control that already announces its state. */
  label?: string;
}) => {
  const size = Math.min(width, height);
  const stroke = borderWidth ?? Math.max(2, Math.round(size / 8));

  return (
    <div
      className={clsx('pq-loop', className)}
      // Only a named spinner gets the live region. Unlabelled it is decorative,
      // and `role="status"` on an `aria-hidden` element is dead markup — the
      // region is out of the a11y tree and can never announce.
      role={label ? 'status' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      style={{
        width: size,
        height: size,
        // Longhands only — mixing the `border` shorthand with `borderTopColor`
        // triggers React's "Updating a style property during rerender" overlay.
        borderWidth: stroke,
        borderStyle: 'solid',
        borderColor: trackColor,
        borderTopColor: color,
        borderRadius: '50%',
        animation: 'spin 0.8s linear infinite',
      }}
    />
  );
};
