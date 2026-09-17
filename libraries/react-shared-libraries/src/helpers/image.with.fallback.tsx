'use client';

import { FC, useEffect, useState } from 'react';
import SafeImage from './safe.image';

interface ImageSrc {
  src: string;
  fallbackSrc: string;
  width: number;
  height: number;
  [key: string]: any;
}

const UNUSABLE_PICTURE = /no-picture\.jpg(?:\?|$)/i;

export function isProbeableImageSrc(
  src?: string | null,
  fallbackSrc?: string | null
): src is string {
  if (!src) return false;
  const trimmed = src.trim();
  if (!trimmed) return false;
  if (fallbackSrc && trimmed === fallbackSrc) return false;
  return !UNUSABLE_PICTURE.test(trimmed);
}

/** Show `fallbackSrc` until `src` actually loads. A hanging Facebook/CDN
 *  photo used to leave a blank hole for ~30s; onError never fired meanwhile,
 *  and SafeImage used to drop the handler anyway. */
export function useFallbackUntilLoaded(
  src: string | undefined | null,
  fallbackSrc: string
) {
  const [shown, setShown] = useState(fallbackSrc);

  useEffect(() => {
    if (!isProbeableImageSrc(src, fallbackSrc)) {
      setShown(fallbackSrc);
      return;
    }

    let cancelled = false;
    const probe = new window.Image();
    probe.referrerPolicy = 'no-referrer';
    const succeed = () => {
      if (!cancelled) setShown(src);
    };
    const fail = () => {
      if (!cancelled) setShown(fallbackSrc);
    };
    probe.onload = succeed;
    probe.onerror = fail;
    probe.src = src;
    if (probe.complete && probe.naturalWidth > 0) {
      succeed();
    } else {
      setShown(fallbackSrc);
    }

    return () => {
      cancelled = true;
      probe.onload = null;
      probe.onerror = null;
    };
  }, [src, fallbackSrc]);

  return shown;
}

const ImageWithFallback: FC<ImageSrc> = (props) => {
  const { src, fallbackSrc, ...rest } = props;
  const imgSrc = useFallbackUntilLoaded(src, fallbackSrc);
  return (
    <SafeImage
      alt=""
      {...rest}
      src={imgSrc}
      referrerPolicy="no-referrer"
    />
  );
};
export default ImageWithFallback;
