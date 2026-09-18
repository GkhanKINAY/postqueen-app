-- An uploaded video is normalized in the background (h264 mp4, fast start,
-- a poster) before it is offered in the library. The row exists from the
-- moment the upload lands so the browser can poll it; "processing" rows are
-- kept out of the media list until they are "ready" or "failed".
ALTER TABLE "Media" ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'ready';
ALTER TABLE "Media" ADD COLUMN IF NOT EXISTS "processingError" TEXT;
