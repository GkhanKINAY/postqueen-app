'use client';

import { useCallback, useRef } from 'react';

/**
 * Swallows a second open while the first modal is still mounting.
 *
 * Only that gap needs guarding: once a modal is on screen its overlay covers
 * the trigger, so the double-click window is the handful of frames before it
 * paints. Tracking "my modal is open" in state and clearing it from the shell's
 * `onClose` looks equivalent and is worse — `closeAll()` and `closeById()`
 * empty the modal store directly without running `onClose`, and a modal closed
 * either way left that flag stuck true and the trigger dead for the rest of the
 * page's life. A ref that clears itself on a timer has no such state to strand.
 *
 * Returns a function to call at the top of the opener: `if (!canOpen()) return;`
 */
export const useOpenGuard = (ms = 600) => {
  const opening = useRef(false);

  return useCallback(() => {
    if (opening.current) {
      return false;
    }
    opening.current = true;
    setTimeout(() => {
      opening.current = false;
    }, ms);
    return true;
  }, [ms]);
};
