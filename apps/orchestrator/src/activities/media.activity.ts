import { Injectable } from '@nestjs/common';
import { Activity, ActivityMethod } from 'nestjs-temporal-core';
import { ApplicationFailure } from '@temporalio/common';
import {
  MediaProcessingError,
  MediaService,
} from '@gitroom/nestjs-libraries/database/prisma/media/media.service';
import { FfmpegError } from '@gitroom/nestjs-libraries/media/ffmpeg.service';
import {
  setHeartbeatDetails,
  withHeartbeat,
} from '@gitroom/nestjs-libraries/temporal/temporal.heartbeat';

/** The failure type the workflow does not retry: ffmpeg looked at the file and gave up. */
export const MEDIA_PROCESSING_ERROR = 'MediaProcessingError';

@Injectable()
@Activity()
export class MediaActivity {
  constructor(private _mediaService: MediaService) {}

  // Runs on the `media` queue, whose worker takes one job at a time: an
  // encode uses two cores for minutes, and two of them at once would starve
  // the publish activities beside them. It heartbeats end to end with the
  // stage it is in, so a worker that dies mid-encode is noticed within the
  // workflow's heartbeatTimeout and the job starts again from the download.
  @ActivityMethod()
  async normalizeMedia(mediaId: string) {
    return withHeartbeat(async () => {
      try {
        return await this._mediaService.normalizeMedia(mediaId, (stage) =>
          setHeartbeatDetails(`normalizeMedia ${mediaId}: ${stage}`)
        );
      } catch (err) {
        // A file ffmpeg cannot read, or not enough scratch space: the same
        // answer on every attempt. Everything else (storage, database) may
        // pass on a retry.
        if (err instanceof FfmpegError || err instanceof MediaProcessingError) {
          // The last lines of ffmpeg's stderr say what was wrong with the
          // file; the scratch paths in them are nobody's business.
          const tail =
            err instanceof FfmpegError && err.stderrTail
              ? err.stderrTail
                  .trim()
                  .split('\n')
                  .slice(-3)
                  .map((line) => line.replace(/\/[^\s:]+\//g, ''))
                  .join('\n')
              : '';
          throw ApplicationFailure.create({
            type: MEDIA_PROCESSING_ERROR,
            nonRetryable: true,
            message: tail ? `${err.message}\n${tail}` : err.message,
          });
        }
        throw err;
      }
    });
  }

  @ActivityMethod()
  async failMediaProcessing(mediaId: string, error: string) {
    return this._mediaService.failProcessing(mediaId, error);
  }
}
