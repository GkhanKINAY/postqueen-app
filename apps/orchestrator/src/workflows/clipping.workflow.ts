import {
  ActivityFailure,
  ApplicationFailure,
  CancellationScope,
  executeChild,
  proxyActivities,
} from '@temporalio/workflow';
import type { ClippingActivity } from '@gitroom/orchestrator/activities/clipping.activity';

// Turns a YouTube video into captioned vertical clips: analyse the video (and
// charge its minutes), transcribe it when it has no usable captions, let the
// model pick the clips, then one child workflow per clip fetches its window,
// captions it and renders it into the media library. Draft posts come last.
// Started by ClippingService.startClipping as `clipping_<id>`.
//
// Upstream submits each job to its media service and polls it from here. This
// fork hands a job to a clipping processor inside one activity on the
// `clipping` queue instead, the way normalizeMedia runs on `media`: whatever
// the processor is (a remote service it polls, or ffmpeg on the worker), the
// workflow only sees an activity that finishes or fails, so choosing or
// changing the processor never touches this file.

// The processor's jobs. startToClose bounds one attempt (a remote job lives an
// hour at most; a local render of a 90 second clip takes a few minutes); the
// heartbeat notices a worker that died mid-job within two minutes; and
// scheduleToClose bounds the whole step, queue wait and retries included, so a
// worker that is away fails the clipping and gives its minutes back instead of
// leaving the customer waiting for a day. A retry after the processor accepted
// the job runs it twice, which only costs the second run: both write the same
// files. That is cheaper than failing a paid clipping on a connection blip or
// a worker restart. A reason that can't change is thrown as non retryable.
const { analyseClipping, fetchClip, renderClip } =
  proxyActivities<ClippingActivity>({
    taskQueue: 'clipping',
    startToCloseTimeout: '1 hour',
    heartbeatTimeout: '2 minute',
    scheduleToCloseTimeout: '3 hour',
    retry: {
      maximumAttempts: 3,
      backoffCoefficient: 2,
      initialInterval: '30 seconds',
    },
  });

// Bookkeeping is idempotent: ride out an outage of a few minutes.
// A reason that can't change is thrown as non retryable and skips the retries
const { failClip, createClippingDrafts, finishClipping, failClipping } =
  proxyActivities<ClippingActivity>({
    startToCloseTimeout: '2 minute',
    taskQueue: 'main',
    retry: {
      maximumAttempts: 10,
      backoffCoefficient: 2,
      initialInterval: '10 seconds',
      maximumInterval: '2 minutes',
    },
  });

// Transcribing and picking wait on an AI provider for the whole call; running
// one again only costs a few cents and overwrites the same result
const { transcribeClipping, pickClippingClips, captionClip } =
  proxyActivities<ClippingActivity>({
    startToCloseTimeout: '15 minute',
    taskQueue: 'main',
    retry: {
      maximumAttempts: 3,
      backoffCoefficient: 1,
      initialInterval: '1 minute',
    },
  });

// The workflow only sees the activity failure wrapper; the reason is its cause.
// Only a "clipping_stop" was written for the customer, anything else (a
// provider's answer, a timeout) is for the logs
const reason = (err: any, fallback: string) => {
  const cause = err instanceof ActivityFailure ? err.cause : err;
  return {
    error: cause?.message || fallback,
    customer:
      cause instanceof ApplicationFailure && cause.type === 'clipping_stop',
  };
};

// One clip, in a workflow of its own so ten clips side by side never share one
// history. A clip that fails is recorded on the clip and never throws, the
// other clips of the video go on
export async function clippingClipWorkflow({ clipId }: { clipId: string }) {
  try {
    const fetched = await fetchClip({ clipId });
    if (fetched.state !== 'done') {
      await failClip({
        clipId,
        error: 'The clip could not be downloaded',
        customer: true,
      });
      return;
    }

    await captionClip({ clipId });

    const rendered = await renderClip({ clipId });
    if (rendered.state !== 'done') {
      await failClip({
        clipId,
        error: 'The clip could not be rendered',
        customer: true,
      });
    }
  } catch (err: any) {
    try {
      // a cancelled workflow still has to say what happened to its clip
      await CancellationScope.nonCancellable(() =>
        failClip({ clipId, ...reason(err, 'The clip could not be rendered') })
      );
    } catch (failed: any) {
      // the clip stays pending and the finish of the clipping closes it
    }
  }
}

export async function clippingWorkflow({ clippingId }: { clippingId: string }) {
  try {
    // a video that can't be analysed throws, with the reason the customer reads
    const analysed = await analyseClipping({ clippingId });

    if (analysed.transcribe) {
      await transcribeClipping({ clippingId });
    }

    const clips = await pickClippingClips({ clippingId });
    // a clip workflow that died still leaves its clip unrendered, which the
    // finish below reads from the records
    await Promise.all(
      clips.map((clipId: string) =>
        executeChild(clippingClipWorkflow, {
          workflowId: `clipping_clip_${clipId}`,
          args: [{ clipId }],
        }).catch(() => undefined)
      )
    );
  } catch (err: any) {
    // a cancelled clipping is still closed and refunded
    return CancellationScope.nonCancellable(() =>
      failClipping({ clippingId, ...reason(err, 'Clipping failed') })
    );
  }

  // the clips are in the media library by now; a draft that could not be
  // created is reported on the clipping and never takes them away
  try {
    await createClippingDrafts({ clippingId });
  } catch (err: any) {
    return CancellationScope.nonCancellable(() =>
      failClipping({
        clippingId,
        ...reason(err, 'The draft posts could not be created'),
      })
    );
  }

  return finishClipping({ clippingId });
}
