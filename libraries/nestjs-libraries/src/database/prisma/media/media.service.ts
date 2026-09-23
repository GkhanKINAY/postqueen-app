import {
  BadRequestException,
  HttpException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { MediaRepository } from '@gitroom/nestjs-libraries/database/prisma/media/media.repository';
import {
  ImageOrientation,
  OpenaiService,
} from '@gitroom/nestjs-libraries/openai/openai.service';
import { generationError } from '@gitroom/nestjs-libraries/openai/generation.error';
import { SubscriptionService } from '@gitroom/nestjs-libraries/database/prisma/subscriptions/subscription.service';
import { Organization } from '@gitroom/nestjs-libraries/database/prisma/generated/client';
import { SaveMediaInformationDto } from '@gitroom/nestjs-libraries/dtos/media/save.media.information.dto';
import { VideoManager } from '@gitroom/nestjs-libraries/videos/video.manager';
import { VideoDto } from '@gitroom/nestjs-libraries/dtos/videos/video.dto';
import { UploadFactory } from '@gitroom/nestjs-libraries/upload/upload.factory';
import {
  detectUploadType,
  DownloadTooLargeError,
  downloadToFile,
  MAX_UPLOAD_BYTES,
  spooledFile,
  uploadTempDir,
} from '@gitroom/nestjs-libraries/upload/uploaded.file';
import {
  getMaxSize,
  UPLOAD_ALLOWED_MIME,
} from '@gitroom/nestjs-libraries/upload/custom.upload.validation';
import {
  decideAction,
  FfmpegService,
  NormalizeAction,
  VIDEO_RULES,
} from '@gitroom/nestjs-libraries/media/ffmpeg.service';
import { createWriteStream, promises as fsp } from 'fs';
import { pipeline } from 'stream/promises';
import { dirname, extname, join } from 'path';
import {
  AuthorizationActions,
  Sections,
  SubscriptionException,
} from '@gitroom/backend/services/auth/permissions/permission.exception.class';
import { TemporalService } from 'nestjs-temporal-core';
import { TypedSearchAttributes } from '@temporalio/common';
import { organizationId } from '@gitroom/nestjs-libraries/temporal/temporal.search.attribute';
import { makeId } from '@gitroom/nestjs-libraries/services/make.is';
import { effectiveIsTrailing } from '@gitroom/nestjs-libraries/database/prisma/subscriptions/pricing';
import { randomBytes } from 'crypto';
import { ioRedis } from '@gitroom/nestjs-libraries/redis/redis.service';

/**
 * Whether this video type is held back because the organization is still on
 * trial.
 *
 * `effectiveIsTrailing` answers that, billing included: on an install with no
 * Stripe keys there is no trial to finish, and the first week of every account
 * used to be told to "finish your trial" and sent to a billing page that cannot
 * take money. It also derives the flag from the registration date the way the
 * auth middleware does for the app, because the public API, MCP and the
 * orchestrator's video activity hand in the stored row, and a founding member
 * past its seven days can still carry the flag there.
 *
 * `integration.service.ts`'s `assertConnectAllowed` is the same rule; this is
 * that guard applied to video generation.
 */
const isTrialLocked = (
  video: { trial?: boolean },
  org: { isTrailing?: boolean; createdAt?: Date | string }
) => !video.trial && effectiveIsTrailing(org);

/**
 * Uploaded videos are normalized in the background (h264 / yuv420p / aac,
 * 1080p at most, upright, fast start, a poster) so every platform takes the
 * file as it is. Images are left alone: the browser already sizes them.
 */
const PROCESSABLE_EXTENSIONS = new Set(['.mp4', '.mov']);
/** Of those, what a platform can be handed unconverted when no normalizer is there. */
const USABLE_AS_IS = new Set(['.mp4']);
const PROCESS_MEDIA_WORKFLOW = 'processMediaWorkflow';
const NO_PROCESSOR = 'No media processor is available to convert this file';
/** How much scratch space a normalize needs beside the source: the output and the poster. */
const SCRATCH_FACTOR = 2.5;
const SCRATCH_FLOOR_BYTES = 100 * 1024 * 1024;

/** A file the normalizer cannot make anything of; retrying would not change that. */
export class MediaProcessingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MediaProcessingError';
  }
}

@Injectable()
export class MediaService {
  private storage = UploadFactory.createStorage();
  private readonly logger = new Logger(MediaService.name);

  constructor(
    private _mediaRepository: MediaRepository,
    private _openAi: OpenaiService,
    private _subscriptionService: SubscriptionService,
    private _videoManager: VideoManager,
    private _temporalService: TemporalService,
    private _ffmpeg: FfmpegService
  ) {}

  async deleteMedia(org: string, id: string) {
    return this._mediaRepository.deleteMedia(org, id);
  }

  findOwnedMediaIds(org: string, ids: string[]) {
    return this._mediaRepository.findOwnedMediaIds(org, ids);
  }

  findOwnedMediaByPaths(org: string, paths: string[]) {
    return this._mediaRepository.findOwnedMediaByPaths(org, paths);
  }

  getMediaById(id: string) {
    return this._mediaRepository.getMediaById(id);
  }

  getMediaByIds(ids: string[]) {
    return ids.length ? this._mediaRepository.getMediaByIds(ids) : Promise.resolve([]);
  }

  async generateImage(
    prompt: string,
    org: Organization,
    generatePromptFirst?: boolean,
    orientation?: ImageOrientation
  ) {
    try {
      const generating = await this._subscriptionService.useCredit(
        org,
        'ai_images',
        async () => {
          if (generatePromptFirst) {
            prompt = await this._openAi.generatePromptForPicture(prompt);
          }
          return this._openAi.generateImage(prompt, orientation);
        }
      );

      return generating;
    } catch (err) {
      throw generationError(err);
    }
  }

  /**
   * One AI image from a brief, expanded into a full render prompt first, then
   * hosted and saved to the media library: the path the AI Image modal, the
   * composer's rail and the agent's tool share. Returns the media row.
   */
  async generateImageToLibrary(
    org: Organization,
    brief: string,
    orientation?: ImageOrientation
  ) {
    const image = await this.generateImage(brief, org, true, orientation);
    const file = await this.storage.uploadSimple(
      'data:image/png;base64,' + image
    );
    return this.saveFile(org.id, file.split('/').pop(), file);
  }

  /**
   * A remote image or video into the library: the public API's
   * /upload-from-url and the agent's uploadFromUrlTool. Both used to read the
   * whole body into memory before looking at it. Now it is streamed to a
   * spooled file under the upload cap, and from there it goes the way a
   * multipart upload goes: the type sniffed from the bytes, the allow-list,
   * storage, and the normalizer for a video. Rejections are
   * BadRequestException with the messages the routes answered before.
   */
  async uploadFromUrl(org: string, url: string) {
    await fsp.mkdir(uploadTempDir(), { recursive: true });
    const dir = await fsp.mkdtemp(join(uploadTempDir(), 'url-'));
    const path = join(dir, 'download');
    try {
      try {
        await downloadToFile(url, path, MAX_UPLOAD_BYTES, { allowHttp: true });
      } catch (err) {
        // Network-level failures (DNS, connection refused, SSRF block, ...)
        // reject rather than answer; keep the real reason reachable for
        // callers that want to surface it
        throw new BadRequestException(
          err instanceof DownloadTooLargeError
            ? 'File is too large.'
            : 'Failed to fetch URL',
          { cause: err }
        );
      }

      const file = spooledFile(path, '', 'upload');
      const detected = await detectUploadType(file);
      if (!detected || !UPLOAD_ALLOWED_MIME.has(detected.mime)) {
        throw new BadRequestException('Unsupported file type.');
      }
      if (file.size > getMaxSize(detected.mime)) {
        throw new BadRequestException('File is too large.');
      }

      const stored = await this.storage.uploadFile({
        ...file,
        mimetype: detected.mime,
        originalname: `upload.${detected.ext}`,
      });
      return await this.saveUploadedFile(
        org,
        stored.originalname,
        stored.path,
        undefined,
        file.size
      );
    } finally {
      await fsp.rm(dir, { recursive: true, force: true });
    }
  }

  saveFile(
    org: string,
    fileName: string,
    filePath: string,
    originalName?: string,
    fileSize?: number,
    thumbnail?: string
  ) {
    return this._mediaRepository.saveFile(
      org,
      fileName,
      filePath,
      originalName,
      fileSize,
      thumbnail
    );
  }

  /**
   * The row for a file that has just landed in storage. A video is handed to
   * the normalizer and comes back as `processing`; the uploader then waits
   * on `getMediaStatus` until the row is `ready` (or `failed`). Anything
   * else is ready at once, the way `saveFile` always was.
   */
  async saveUploadedFile(
    org: string,
    fileName: string,
    filePath: string,
    originalName?: string,
    fileSize?: number
  ) {
    const media = await this.saveFile(org, fileName, filePath, originalName, fileSize);
    const ext = extname(fileName || '').toLowerCase();
    if (!PROCESSABLE_EXTENSIONS.has(ext)) {
      return media;
    }

    const client = this._temporalService.client.getRawClient();
    if (!client) {
      return this.releaseUnprocessed(org, media, ext);
    }
    await this._mediaRepository.startProcessing(org, media.id);
    try {
      await client.workflow.start(PROCESS_MEDIA_WORKFLOW, {
        workflowId: `media_${media.id}`,
        taskQueue: 'main',
        args: [{ mediaId: media.id }],
        typedSearchAttributes: new TypedSearchAttributes([
          {
            key: organizationId,
            value: org,
          },
        ]),
      });
    } catch (err) {
      this.logger.error(`Could not start ${PROCESS_MEDIA_WORKFLOW} for media ${media.id}`, err);
      return this.releaseUnprocessed(org, media, ext);
    }
    return { ...media, status: 'processing' };
  }

  /**
   * No workflow could be started: an mp4 is offered as it came, a .mov is of
   * no use to any platform and is dropped with the reason on its row.
   */
  private async releaseUnprocessed(
    org: string,
    media: Awaited<ReturnType<MediaService['saveFile']>>,
    ext: string
  ) {
    if (USABLE_AS_IS.has(ext)) {
      this.logger.warn(`Media ${media.id} is offered without normalizing: ${NO_PROCESSOR}`);
      return this._mediaRepository.finishProcessing(org, media.id, {});
    }
    return this.failProcessing(media.id, NO_PROCESSOR);
  }

  // Upload widget (MCP Apps): the session id is what the model sees and polls,
  // the ticket is the credential the widget uploads with. It is handed to the
  // widget only, so it doesn't end up in the conversation
  async createUploadSession(org: string) {
    const sessionId = randomBytes(16).toString('hex');
    await ioRedis.set(`uploadSession:${sessionId}`, org, 'EX', 3600);
    return sessionId;
  }

  private async checkUploadSession(org: string, sessionId: string) {
    if ((await ioRedis.get(`uploadSession:${sessionId}`)) !== org) {
      throw new HttpException('Upload session not found or expired', 404);
    }
  }

  async createUploadTicket(org: string, sessionId: string) {
    await this.checkUploadSession(org, sessionId);
    const ticket = randomBytes(32).toString('hex');
    await ioRedis.set(
      `uploadTicket:${ticket}`,
      JSON.stringify({ org, sessionId }),
      'EX',
      600
    );
    return ticket;
  }

  // A ticket never outlives its session: the upload is spooled to disk and
  // stored right after this check, so an expired session has to be refused here
  async getUploadTicket(ticket: string) {
    const found = JSON.parse(
      (await ioRedis.get(`uploadTicket:${ticket}`)) || 'null'
    ) as { org: string; sessionId: string } | null;
    if (
      !found ||
      (await ioRedis.get(`uploadSession:${found.sessionId}`)) !== found.org
    ) {
      return null;
    }
    return found;
  }

  async saveUploadSessionFile(
    org: string,
    sessionId: string,
    fileName: string,
    filePath: string,
    originalName?: string,
    fileSize?: number
  ) {
    await this.checkUploadSession(org, sessionId);
    const media = await this.saveUploadedFile(
      org,
      fileName,
      filePath,
      originalName,
      fileSize
    );
    // a list, so parallel uploads of the same session can't overwrite each other
    await ioRedis.rpush(`uploadSessionMedia:${sessionId}`, media.id);
    await ioRedis.expire(`uploadSessionMedia:${sessionId}`, 3600);
    return media;
  }

  async getUploadSession(org: string, sessionId: string) {
    await this.checkUploadSession(org, sessionId);
    const list = await ioRedis.lrange(`uploadSessionMedia:${sessionId}`, 0, -1);
    return (
      await Promise.all(
        list.map((id) => this._mediaRepository.getMediaStatus(org, id))
      )
    ).filter((f) => f);
  }

  async getMediaStatus(org: string, id: string) {
    const media = await this._mediaRepository.getMediaStatus(org, id);
    if (!media) {
      throw new HttpException('Media not found', 404);
    }
    return media;
  }

  /**
   * The body of the `normalizeMedia` activity. Reads the upload back out of
   * storage, brings it to the rules, cuts a poster, and writes the result on
   * the row. Idempotent: a row that is no longer `processing` was finished by
   * an earlier attempt and is returned as it is. A re-encoded file gets a new
   * key (the uploads route serves objects as immutable, so nothing is ever
   * overwritten in place) and the original is removed afterwards.
   */
  async normalizeMedia(mediaId: string, onProgress?: (stage: string) => void) {
    const media = await this._mediaRepository.getMediaById(mediaId);
    if (!media) {
      throw new MediaProcessingError(`Media ${mediaId} does not exist`);
    }
    if (media.status !== 'processing') {
      return media;
    }
    const org = media.organizationId;
    const ext = extname(media.name).toLowerCase();
    await this.sweepScratch(mediaId);
    await fsp.mkdir(uploadTempDir(), { recursive: true });
    const dir = await fsp.mkdtemp(join(uploadTempDir(), `pq-media-${mediaId}-`));
    try {
      const sourcePath = join(dir, `source${ext}`);
      onProgress?.('download');
      await pipeline(await this.storage.readFile(media.path), createWriteStream(sourcePath));
      await this.assertScratchSpace(dir, (await fsp.stat(sourcePath)).size);

      const result = await this.normalizeLocalFile(dir, sourcePath, ext, onProgress);
      onProgress?.('upload');
      const thumbnail = await this.uploadPoster(result.posterPath);
      if (result.action === 'none') {
        this.logger.log(`Media ${mediaId}: action=none, poster only`);
        return this._mediaRepository.finishProcessing(org, mediaId, { thumbnail });
      }

      const rendered = spooledFile(result.outputPath, 'video/mp4', 'video.mp4');
      const uploaded = await this.storage.uploadFile(rendered);
      const row = await this._mediaRepository.finishProcessing(org, mediaId, {
        name: uploaded.originalname,
        path: uploaded.path,
        thumbnail,
        fileSize: rendered.size,
      });
      this.logger.log(`Media ${mediaId}: action=${result.action}, ${media.name} -> ${uploaded.originalname}`);
      // The original is of no use once the row points elsewhere; a failure
      // here leaves an orphan object, not a broken media row.
      await this.storage.removeFile(media.path).catch((err) => {
        this.logger.warn(`Media ${mediaId}: could not remove the original ${media.path}`, err);
      });
      return row;
    } finally {
      await fsp.rm(dir, { recursive: true, force: true });
    }
  }

  /**
   * Probe, then the least that makes the file compliant (nothing, a remux,
   * or a transcode), then a poster. The shared step between an uploaded
   * video and a generated one.
   */
  async normalizeLocalFile(
    dir: string,
    sourcePath: string,
    ext: string,
    onProgress?: (stage: string) => void
  ): Promise<{ action: NormalizeAction; outputPath: string; posterPath: string }> {
    const probe = await this._ffmpeg.probe(sourcePath);
    if (!probe.vcodec || !probe.width || !probe.height) {
      throw new MediaProcessingError('The file has no video stream');
    }
    const action = decideAction(probe, ext, VIDEO_RULES);
    let outputPath = sourcePath;
    if (action === 'remux') {
      onProgress?.('remux');
      outputPath = join(dir, 'normalized.mp4');
      await this._ffmpeg.remuxFaststart(sourcePath, outputPath);
    } else if (action === 'transcode') {
      onProgress?.('transcode 0%');
      outputPath = join(dir, 'normalized.mp4');
      await this._ffmpeg.transcode(sourcePath, outputPath, probe, VIDEO_RULES, (percent) =>
        onProgress?.(`transcode ${percent}%`)
      );
    }
    // The same frame the browser's poster capture takes.
    const posterPath = join(dir, 'poster.jpg');
    await this._ffmpeg.poster(outputPath, posterPath, Math.min(0.5, probe.duration * 0.1));
    return { action, outputPath, posterPath };
  }

  /** The normalizer gave up: the row says why, and a file no platform can use is dropped. */
  async failProcessing(mediaId: string, error: string) {
    const media = await this._mediaRepository.getMediaById(mediaId);
    if (!media) {
      return null;
    }
    // Finished by an attempt that outlived its heartbeat on another worker:
    // the row is right as it is.
    if (media.status !== 'processing') {
      return media;
    }
    const org = media.organizationId;
    const row = await this._mediaRepository.finishProcessing(org, mediaId, { error });
    if (!USABLE_AS_IS.has(extname(media.name).toLowerCase())) {
      await this._mediaRepository.deleteMedia(org, mediaId);
      await this.storage.removeFile(media.path).catch((err) => {
        this.logger.warn(`Media ${mediaId}: could not remove ${media.path}`, err);
      });
    }
    return row;
  }

  private async uploadPoster(posterPath: string) {
    const uploaded = await this.storage.uploadFile(
      spooledFile(posterPath, 'image/jpeg', 'poster.jpg')
    );
    return uploaded.path as string;
  }

  /** A worker that died mid-job left its directory behind; a retry starts clean. */
  private async sweepScratch(mediaId: string) {
    const prefix = `pq-media-${mediaId}-`;
    const entries = await fsp.readdir(uploadTempDir()).catch(() => [] as string[]);
    await Promise.all(
      entries
        .filter((name) => name.startsWith(prefix))
        .map((name) => fsp.rm(join(uploadTempDir(), name), { recursive: true, force: true }))
    );
  }

  private async assertScratchSpace(dir: string, sourceBytes: number) {
    const stats = await fsp.statfs(dir).catch(() => null);
    if (!stats) {
      return;
    }
    const free = Number(stats.bavail) * Number(stats.bsize);
    const needed = sourceBytes * SCRATCH_FACTOR + SCRATCH_FLOOR_BYTES;
    if (free < needed) {
      throw new MediaProcessingError(
        `Not enough scratch space to convert this file (${Math.round(free / 1048576)} MB free, ${Math.round(needed / 1048576)} MB needed)`
      );
    }
  }

  getMedia(org: string, page: number, search?: string) {
    return this._mediaRepository.getMedia(org, page, search);
  }

  saveMediaInformation(org: string, data: SaveMediaInformationDto) {
    return this._mediaRepository.saveMediaInformation(org, data);
  }

  getVideoOptions() {
    return this._videoManager.getAllVideos();
  }

  async generateVideoAllowed(org: Organization, type: string) {
    const video = this._videoManager.getVideoByName(type);
    if (!video) {
      throw new HttpException(`Video generator ${type} not found`, 404);
    }

    if (isTrialLocked(video, org)) {
      throw new HttpException('This video is not available in trial mode', 406);
    }

    return true;
  }

  private async validateVideoRequest(org: Organization, body: VideoDto) {
    const totalCredits = await this._subscriptionService.checkCredits(
      org,
      'ai_videos'
    );

    if (totalCredits.credits <= 0) {
      throw new SubscriptionException({
        action: AuthorizationActions.Create,
        section: Sections.VIDEOS_PER_MONTH,
      });
    }

    const video = this._videoManager.getVideoByName(body.type);
    if (!video) {
      throw new HttpException(`Video generator ${body.type} not found`, 404);
    }

    if (isTrialLocked(video, org)) {
      throw new HttpException('This video is not available in trial mode', 406);
    }

    await video.instance.processAndValidate(body.customParams);
    return video;
  }

  async generateVideo(org: Organization, body: VideoDto) {
    try {
      const video = await this.validateVideoRequest(org, body);

      return await this._subscriptionService.useCredit(
        org,
        'ai_videos',
        async () => {
          const produced = await video.instance.process(
            body.output,
            body.customParams
          );
          // A provider's own URL is downloaded beside a file the generator
          // rendered here; either is brought to the rules and given a poster
          // before it goes into storage, the way an upload is, and the
          // directory is dropped afterwards.
          await fsp.mkdir(uploadTempDir(), { recursive: true });
          const dir =
            typeof produced === 'string' || dirname(produced.localPath) === uploadTempDir()
              ? await fsp.mkdtemp(join(uploadTempDir(), 'pq-video-'))
              : dirname(produced.localPath);
          try {
            let sourcePath: string;
            if (typeof produced === 'string') {
              sourcePath = join(dir, 'source.mp4');
              await downloadToFile(produced, sourcePath);
            } else {
              sourcePath = produced.localPath;
            }
            const result = await this.normalizeLocalFile(dir, sourcePath, extname(sourcePath));
            // The size is read before the upload: local storage renames
            // the file into place, so nothing is there to stat afterwards.
            const rendered = spooledFile(result.outputPath, 'video/mp4', 'video.mp4');
            const uploaded = await this.storage.uploadFile(rendered);
            const thumbnail = await this.uploadPoster(result.posterPath);
            return this.saveFile(
              org.id,
              uploaded.originalname,
              uploaded.path,
              undefined,
              rendered.size,
              thumbnail
            );
          } finally {
            await fsp.rm(dir, { recursive: true, force: true });
            if (typeof produced !== 'string') {
              await fsp.rm(produced.localPath, { force: true });
            }
          }
        }
      );
    } catch (err) {
      throw generationError(err);
    }
  }

  // Generating a video takes minutes, longer than an MCP request can stay open,
  // so the generation runs in a workflow and the caller polls its status by job id
  async startGenerateVideo(org: Organization, body: VideoDto) {
    // validated here as well as in the workflow so bad input fails before a job exists
    try {
      await this.validateVideoRequest(org, body);
    } catch (err) {
      throw generationError(err);
    }

    const client = this._temporalService.client.getRawClient();
    if (!client) {
      throw new HttpException('Video generation is not available', 503);
    }

    const jobId = `video_${org.id}_${makeId(10)}`;
    await client.workflow.start('generateVideoWorkflow', {
      workflowId: jobId,
      taskQueue: 'main',
      args: [
        {
          organizationId: org.id,
          body,
        },
      ],
      typedSearchAttributes: new TypedSearchAttributes([
        {
          key: organizationId,
          value: org.id,
        },
      ]),
    });

    return { jobId };
  }

  async getGenerateVideoStatus(
    org: Organization,
    jobId: string
  ): Promise<{
    status: 'pending' | 'completed' | 'failed';
    id?: string;
    path?: string;
    /** From the live row: a poster made by an earlier reader stays. */
    thumbnail?: string | null;
    alt?: string | null;
    error?: string;
  }> {
    // the job id carries the organization, so one org can't poll another's job
    if (!jobId.startsWith(`video_${org.id}_`)) {
      throw new HttpException('Video job not found', 404);
    }

    const handle = await this._temporalService.client.getWorkflowHandle(jobId);
    let status: string;
    try {
      status = (await handle.describe()).status.name;
    } catch (err) {
      throw new HttpException('Video job not found', 404);
    }

    if (status === 'RUNNING') {
      return { status: 'pending' };
    }

    try {
      const media = (await handle.result()) as Awaited<
        ReturnType<MediaService['saveFile']>
      >;
      // The workflow's result is the row as it was saved; the poster and alt
      // text written since live on the row, and a card drawn again for a
      // finished job must not make a second poster over them.
      const row = await this._mediaRepository.getMediaById(media.id);
      return {
        status: 'completed',
        id: media.id,
        path: media.path,
        thumbnail: row?.thumbnail ?? null,
        alt: row?.alt ?? null,
      };
    } catch (err) {
      // the workflow failure wraps the activity failure which wraps the actual error
      let cause: any = err;
      while (cause?.cause && cause.cause !== cause) {
        cause = cause.cause;
      }
      return {
        status: 'failed',
        error: cause?.message || String(err),
      };
    }
  }

  async videoFunction(identifier: string, functionName: string, body: any) {
    // An unknown or unconfigured generator is the caller's to fix, not a
    // server failure: a plain Error here answered 500.
    const video = this._videoManager.getVideoByName(identifier);
    if (!video) {
      throw new HttpException(`Video generator ${identifier} not found`, 404);
    }

    // @ts-ignore
    const functionToCall = video.instance[functionName];
    if (
      typeof functionToCall !== 'function' ||
      this._videoManager.checkAvailableVideoFunction(functionToCall)
    ) {
      throw new HttpException(
        `Function ${functionName} not found on video instance`,
        400
      );
    }

    return functionToCall(body);
  }
}
