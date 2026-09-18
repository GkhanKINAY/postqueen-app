import { proxyActivities } from '@temporalio/workflow';
import { TimeoutFailure } from '@temporalio/common';
import type { MediaActivity } from '@gitroom/orchestrator/activities/media.activity';

// The failure type MediaActivity raises for a file ffmpeg gave up on. A
// literal rather than an import: a value import would pull the activity, and
// Nest with it, into the workflow bundle.
const MEDIA_PROCESSING_ERROR = 'MediaProcessingError';

// Normalizes one uploaded video: h264 mp4, 1080p at most, upright, fast
// start, a poster. Started by MediaService.saveUploadedFile as `media_<id>`.
//
// The encode itself is capped at FFMPEG_TIMEOUT_MS (20 minutes) inside the
// activity, so startToClose only has to outlast that plus the download and
// upload around it. The heartbeat carries the stage; a worker that dies takes
// the job with it and the one retry starts over from the download (the
// activity is idempotent: the original is still in storage and the row is
// still `processing`). A file ffmpeg cannot make anything of fails with
// MediaProcessingError and is not retried. scheduleToClose bounds the whole
// thing, queue wait included: a day, so a worker that was away converts the
// backlog when it returns instead of failing every upload made meanwhile
// (the browser stops waiting after 25 minutes on its own).
const { normalizeMedia } = proxyActivities<MediaActivity>({
  taskQueue: 'media',
  startToCloseTimeout: '25 minute',
  heartbeatTimeout: '2 minute',
  scheduleToCloseTimeout: '24 hour',
  retry: {
    maximumAttempts: 2,
    nonRetryableErrorTypes: [MEDIA_PROCESSING_ERROR],
  },
});

// Writing the failure on the row is a single database update; it runs on
// `main` so it does not queue behind the encodes. No attempt cap: a row
// left `processing` is hidden from the library for good, so this keeps
// retrying (with Temporal's capped backoff) until the database takes it.
const { failMediaProcessing } = proxyActivities<MediaActivity>({
  taskQueue: 'main',
  startToCloseTimeout: '2 minute',
});

// The reason as the uploader will show it: a sentence for a timeout, the
// activity's own message otherwise.
const reasonOf = (err: unknown) => {
  let cause: any = err;
  while (cause?.cause && cause.cause !== cause) {
    if (cause instanceof TimeoutFailure) {
      break;
    }
    cause = cause.cause;
  }
  if (cause instanceof TimeoutFailure) {
    return 'The conversion did not finish in time';
  }
  return String(cause?.message || err || 'Media processing failed');
};

export async function processMediaWorkflow({ mediaId }: { mediaId: string }) {
  try {
    return await normalizeMedia(mediaId);
  } catch (err) {
    return failMediaProcessing(mediaId, reasonOf(err));
  }
}
