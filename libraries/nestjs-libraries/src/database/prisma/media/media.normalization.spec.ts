import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const read = (rel: string) =>
  readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

const service = read('./media.service.ts');
const repository = read('./media.repository.ts');
const schema = read('../schema.prisma');
const migration = read('../migrations/20260918120000_media_processing_status/migration.sql');
const posts = read('../posts/posts.service.ts');
const uploadInterface = read('../../../upload/upload.interface.ts');
const localStorage = read('../../../upload/local.storage.ts');
const cloudflare = read('../../../upload/cloudflare.storage.ts');
const validation = read('../../../upload/custom.upload.validation.ts');
const r2Uploader = read('../../../upload/r2.uploader.ts');
const temporalModule = read('../../../temporal/temporal.module.ts');
const uploadTool = read('../../../chat/tools/upload.from.url.tool.ts');
const mediaController = read('../../../../../../apps/backend/src/api/routes/media.controller.ts');
const publicController = read(
  '../../../../../../apps/backend/src/public-api/routes/v1/public.integrations.controller.ts'
);
const thirdParty = read('../../../../../../apps/backend/src/api/routes/third-party.controller.ts');
const activity = read('../../../../../../apps/orchestrator/src/activities/media.activity.ts');
const workflow = read('../../../../../../apps/orchestrator/src/workflows/process.media.workflow.ts');
const workflows = read('../../../../../../apps/orchestrator/src/workflows/index.ts');
const orchestratorModule = read('../../../../../../apps/orchestrator/src/app.module.ts');
const uppy = read('../../../../../react-shared-libraries/src/helpers/uppy.upload.ts');
const uploader = read('../../../../../../apps/frontend/src/components/media/new.uploader.tsx');
const mediaBox = read('../../../../../../apps/frontend/src/components/media/media.box.tsx');
const envExample = read('../../../../../../.env.example');

const count = (haystack: string, needle: string) => haystack.split(needle).length - 1;

describe('Uploaded video normalization', () => {
  it('keeps the processing state on the row and out of the library until it is done', () => {
    assert.match(schema, /status\s+String\s+@default\("ready"\)\n\s+processingError\s+String\?/);
    assert.match(migration, /ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'ready'/);
    assert.match(migration, /ADD COLUMN IF NOT EXISTS "processingError" TEXT/);
    assert.equal(count(repository, "status: { not: 'processing' }"), 2);
    assert.match(repository, /startProcessing\(org: string, id: string\)/);
    assert.match(repository, /finishProcessing\(\n\s+org: string,\n\s+id: string,/);
    assert.match(repository, /status: result\.error \? 'failed' : 'ready'/);
    // The status read has no deletedAt filter: a failed .mov is soft-deleted and still polled.
    assert.match(repository, /getMediaStatus\(org: string, id: string\) \{\n\s+return this\._media\.model\.media\.findFirst\(\{\n\s+where: \{ id, organizationId: org \},/);
  });

  it('routes every upload through saveUploadedFile and only videos into the workflow', () => {
    assert.equal(count(mediaController, 'saveUploadedFile('), 3);
    assert.equal(count(publicController, 'saveUploadedFile('), 1);
    // Both URL uploads share one path, and it ends where a multipart one does
    assert.equal(count(publicController, 'this._mediaService.uploadFromUrl('), 1);
    assert.equal(count(uploadTool, 'this._mediaService.uploadFromUrl('), 1);
    assert.match(service, /async uploadFromUrl\(org: string, url: string\) \{[\s\S]*?return await this\.saveUploadedFile\(/);
    assert.equal(count(thirdParty, 'saveUploadedFile('), 2);
    assert.match(service, /const PROCESSABLE_EXTENSIONS = new Set\(\['\.mp4', '\.mov'\]\);/);
    assert.match(service, /const USABLE_AS_IS = new Set\(\['\.mp4'\]\);/);
    assert.match(service, /client\.workflow\.start\(PROCESS_MEDIA_WORKFLOW, \{\n\s+workflowId: `media_\$\{media\.id\}`,\n\s+taskQueue: 'main',/);
    assert.match(service, /return \{ \.\.\.media, status: 'processing' \};/);
    // No Temporal: an mp4 is offered as it came, a .mov is dropped with the reason.
    assert.match(service, /if \(USABLE_AS_IS\.has\(ext\)\) \{[\s\S]*?finishProcessing\(org, media\.id, \{\}\);\n\s+\}\n\s+return this\.failProcessing\(media\.id, NO_PROCESSOR\);/);
    assert.match(mediaController, /@Get\('\/:id\/status'\)/);
    assert.match(publicController, /@Get\('\/media\/:id\/status'\)/);
    assert.match(uploadTool, /status: z\.string\(\)\.optional\(\),/);
    // A .mov is waited on: a post takes no .mov, so "attach it now" would be a lie.
    assert.match(uploadTool, /if \(saved\.status !== 'processing' \|\| \/\\\.mp4\$\/i\.test\(saved\.name\)\) \{\n\s+return saved;/);
    assert.match(thirdParty, /file\.split\('\/'\)\.pop\(\),\n\s+file,\n\s+item\.name \|\| undefined/);
  });

  it('normalizes idempotently, to a new key, and removes the original afterwards', () => {
    assert.match(service, /if \(media\.status !== 'processing'\) \{\n\s+return media;\n\s+\}/);
    assert.match(service, /await this\.sweepScratch\(mediaId\);/);
    assert.match(service, /await this\.assertScratchSpace\(dir, \(await fsp\.stat\(sourcePath\)\)\.size\);/);
    assert.match(service, /pipeline\(await this\.storage\.readFile\(media\.path\), createWriteStream\(sourcePath\)\)/);
    assert.match(service, /if \(result\.action === 'none'\) \{[\s\S]*?finishProcessing\(org, mediaId, \{ thumbnail \}\);/);
    assert.match(service, /await this\.storage\.removeFile\(media\.path\)\.catch/);
    assert.match(service, /const action = decideAction\(probe, ext, VIDEO_RULES\);/);
    assert.match(service, /await this\._ffmpeg\.poster\(outputPath, posterPath, Math\.min\(0\.5, probe\.duration \* 0\.1\)\);/);
    // A late attempt on another worker cannot fail a row that is already final.
    assert.match(service, /async failProcessing\(mediaId: string, error: string\) \{[\s\S]*?if \(media\.status !== 'processing'\) \{\n\s+return media;/);
    // Failing keeps a usable mp4 on its row and drops anything else.
    assert.match(service, /if \(!USABLE_AS_IS\.has\(extname\(media\.name\)\.toLowerCase\(\)\)\) \{\n\s+await this\._mediaRepository\.deleteMedia\(org, mediaId\);/);
    assert.match(service, /export class MediaProcessingError extends Error/);
  });

  it('reads and removes stored files by their saved URL on both storages', () => {
    assert.match(uploadInterface, /readFile\(path: string\): Promise<Readable>;/);
    assert.match(localStorage, /const file = ownUploadPath\(path\);/);
    assert.match(localStorage, /return createReadStream\(file\);/);
    assert.match(cloudflare, /new GetObjectCommand\(\{ Bucket: this\._bucketName, Key: this\.keyOf\(path\) \}\)/);
    assert.match(cloudflare, /new DeleteObjectCommand\(\{ Bucket: this\._bucketName, Key: this\.keyOf\(path\) \}\)/);
    assert.match(cloudflare, /const KEY = \/\^\[A-Za-z0-9_-\]\{1,120\}\\\.\[a-z0-9\]\{1,5\}\$\/i;/);
    // .mov is accepted everywhere an mp4 is, on the way in only.
    for (const source of [localStorage, cloudflare, validation]) {
      assert.match(source, /'video\/quicktime'/);
    }
    // The URL uploads take the multipart allow-list rather than a copy of it
    assert.match(service, /UPLOAD_ALLOWED_MIME\.has\(detected\.mime\)/);
    assert.match(r2Uploader, /'\.mov': 'video\/quicktime'/);
  });

  it('runs on its own queue, one at a time, heartbeating, and never retries a bad file', () => {
    assert.match(temporalModule, /identifier: 'media',\n\s+maxConcurrentJob: Number\(process\.env\.MEDIA_PROCESSING_CONCURRENCY\) \|\| 1,/);
    assert.match(workflow, /taskQueue: 'media',\n\s+startToCloseTimeout: '25 minute',\n\s+heartbeatTimeout: '2 minute',\n\s+scheduleToCloseTimeout: '24 hour',/);
    // Writing the failure never gives up: a row left `processing` is hidden for good.
    assert.match(workflow, /const \{ failMediaProcessing \} = proxyActivities<MediaActivity>\(\{\n\s+taskQueue: 'main',\n\s+startToCloseTimeout: '2 minute',\n\}\);/);
    assert.match(workflow, /if \(cause instanceof TimeoutFailure\) \{\n\s+return 'The conversion did not finish in time';/);
    assert.match(workflow, /nonRetryableErrorTypes: \[MEDIA_PROCESSING_ERROR\]/);
    // The literal, not an import: a value import would pull Nest into the workflow bundle.
    assert.match(workflow, /import type \{ MediaActivity \}/);
    assert.doesNotMatch(workflow, /^import \{[^}]*\} from '@gitroom/m);
    assert.match(workflow, /const MEDIA_PROCESSING_ERROR = 'MediaProcessingError';/);
    assert.match(workflow, /catch \(err\) \{\n\s+return failMediaProcessing\(mediaId, reasonOf\(err\)\);/);
    assert.match(activity, /export const MEDIA_PROCESSING_ERROR = 'MediaProcessingError';/);
    assert.match(activity, /return withHeartbeat\(async \(\) => \{/);
    assert.match(activity, /err instanceof FfmpegError \|\| err instanceof MediaProcessingError/);
    assert.match(activity, /nonRetryable: true,/);
    assert.match(workflows, /export \* from '\.\/process\.media\.workflow';/);
    assert.match(orchestratorModule, /PostMetricsActivity,\n\s+MediaActivity,\n\];/);
    assert.match(envExample, /#MEDIA_PROCESSING_CONCURRENCY=1/);
  });

  it('holds the upload open in the browser until the row is final, without ever rejecting', () => {
    assert.match(uppy, /export class WaitForMediaProcessing extends BasePlugin</);
    assert.match(uppy, /this\.type = 'modifier';/);
    assert.match(uppy, /this\.uppy\.addPostProcessor\(this\.wait\);/);
    assert.match(uppy, /const savedRow = \(body: any\) => body\?\.saved \?\? body;/);
    assert.match(uppy, /mode: 'indeterminate',\n\s+message: this\.opts\.processingMessage,/);
    assert.match(uppy, /this\.opts\.fetch\(`\/media\/\$\{row\.id\}\/status`\)/);
    assert.match(uppy, /if \(\+\+misses >= 5\) \{/);
    // Already failed when the upload answered (no workflow), and the final row always goes back on the file.
    assert.match(uppy, /if \(row\.status === 'failed'\) \{\n\s+this\.settle\(fileID, row\);/);
    assert.match(uppy, /if \(final\?\.id\) \{\n\s+this\.uppy\.setFileState\(fileID, \{\n\s+response:/);
    assert.doesNotMatch(uppy, /throw new Error\(this\.opts\.failedMessage\)/);
    assert.match(uppy, /error: final\?\.processingError \|\| this\.opts\.failedMessage,/);
    assert.match(uppy, /this\.uppy\.emit\('postprocess-complete', this\.uppy\.getFile\(fileID\)\);/);
    assert.match(uploader, /uppy2\.use\(WaitForMediaProcessing, \{/);
    assert.match(uploader, /processingMessage: t\('processing', 'Processing'\),/);
    assert.match(uploader, /if \(type === 'video\/mp4'\) \{\n\s+return \['video\/mp4', 'video\/quicktime'\];/);
    assert.match(mediaBox, /uppy\.on\('postprocess-progress', processing\);/);
    assert.match(mediaBox, /uppy\.off\('postprocess-progress', processing\);/);
    assert.match(mediaBox, /upload\.processing \? t\('processing', 'Processing'\) : `\$\{upload\.percent\}%`/);
    assert.match(mediaBox, /'video\/mp4,video\/quicktime,\.mov'/);
  });

  it('publishes with the live row when a post was made while its video was still converting', () => {
    assert.match(posts, /const liveRows = await this\._mediaService\.getMediaByIds\(/);
    // Only a video: a provider's JPEG conversion of an image is written onto the post on purpose.
    assert.match(posts, /if \(live && hasExtension\(live\.path, 'mp4'\) && live\.path !== p\.path\) \{\n\s+imageUpdateNeeded = true;/);
    assert.match(repository, /getMediaByIds\(ids: string\[\]\)/);
  });
});
