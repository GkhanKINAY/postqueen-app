/**
 * One frame of a video as a JPEG, drawn in the browser: the poster a video
 * shows before it plays and the thumbnail the calendar and media library
 * draw for it. The same canvas capture the thumbnail picker in the media
 * settings makes by hand, without the picker.
 *
 * Resolves to nothing when the browser cannot read the frame (a video host
 * without CORS taints the canvas; a codec the browser lacks never decodes;
 * a slow host runs past `timeoutMs`). Callers keep going without a poster.
 */
export const captureVideoPoster = (
  src: string,
  { atSeconds = 0.5, timeoutMs = 12000 } = {}
): Promise<Blob | undefined> =>
  new Promise((resolve) => {
    if (typeof document === 'undefined') {
      resolve(undefined);
      return;
    }
    const video = document.createElement('video');
    let settled = false;
    const finish = (blob?: Blob) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      video.removeAttribute('src');
      video.load();
      resolve(blob);
    };
    const timer = setTimeout(() => finish(), timeoutMs);
    video.crossOrigin = 'anonymous';
    video.muted = true;
    video.playsInline = true;
    video.preload = 'auto';
    video.addEventListener('error', () => finish());
    video.addEventListener('loadedmetadata', () => {
      // A clip shorter than the seek point is captured near its start.
      const at = Math.min(atSeconds, Math.max(0, video.duration - 0.1));
      video.currentTime = Number.isFinite(at) ? at : 0;
    });
    video.addEventListener('seeked', () => {
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const context = canvas.getContext('2d');
      if (!context || !canvas.width || !canvas.height) {
        finish();
        return;
      }
      try {
        context.drawImage(video, 0, 0, canvas.width, canvas.height);
        canvas.toBlob((blob) => finish(blob || undefined), 'image/jpeg', 0.8);
      } catch {
        finish();
      }
    });
    video.src = src;
  });
