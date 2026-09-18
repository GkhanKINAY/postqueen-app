import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const read = (rel: string) =>
  readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

const slides = read('./images.slides.ts');
const videoModule = read('../video.module.ts');
const videoInterface = read('../video.interface.ts');
const mediaService = read('../../database/prisma/media/media.service.ts');
const mediaController = read('../../../../../apps/backend/src/api/routes/media.controller.ts');
const uppy = read('../../../../react-shared-libraries/src/helpers/uppy.upload.ts');
const variables = read('../../../../react-shared-libraries/src/helpers/variable.context.tsx');
const uploader = read('../../../../../apps/frontend/src/components/media/new.uploader.tsx');
const packageJson = read('../../../../../package.json');
const envExample = read('../../../../../.env.example');
const dockerfile = read('../../../../../Dockerfile.dev');

describe('Image Text Slides without Transloadit', () => {
  it('assembles the video with the ffmpeg on the image and hands back a local file', () => {
    assert.doesNotMatch(slides, /transloadit/i);
    assert.match(slides, /private _ffmpeg: FfmpegService/);
    assert.match(slides, /ffmpegInstalled\(\),\n\}\)/);
    assert.match(slides, /fsp\.mkdir\(uploadTempDir\(\), \{ recursive: true \}\)/);
    assert.match(slides, /this\._ffmpeg\.assembleSlides\(\{/);
    assert.match(slides, /return \{ localPath: outputPath \};/);
    // Inputs are files in the job's own directory, never URLs handed to a service.
    assert.match(slides, /downloadToFile\(url, imagePath, MAX_SLIDE_IMAGE_BYTES\)/);
    assert.match(slides, /fsp\.writeFile\(audioPath, buffer\)/);
    // The narration was uploaded to storage only for Transloadit to fetch it.
    assert.doesNotMatch(slides, /UploadFactory|this\.storage|uploadSimple|uploadFile/);
    assert.match(videoInterface, /export type VideoOutput = URL \| \{ localPath: string \};/);
    assert.match(videoModule, /providers: \[FfmpegService, ImagesSlides, Seedance, VideoManager\]/);
  });

  it('brings a rendered file or a downloaded URL to the rules, then into storage, and drops the directory', () => {
    assert.match(mediaService, /if \(typeof produced === 'string'\) \{\n\s+sourcePath = join\(dir, 'source\.mp4'\);\n\s+await downloadToFile\(produced, sourcePath\);/);
    assert.match(mediaService, /const result = await this\.normalizeLocalFile\(dir, sourcePath, extname\(sourcePath\)\);/);
    // Size read before the upload: local storage renames the file away.
    assert.match(mediaService, /const rendered = spooledFile\(result\.outputPath, 'video\/mp4', 'video\.mp4'\);\n\s+const uploaded = await this\.storage\.uploadFile\(rendered\);/);
    assert.match(mediaService, /rendered\.size,\n\s+thumbnail\n/);
    assert.doesNotMatch(mediaService, /statSync\(produced/);
    // A file dropped straight into the spool directory gets its own directory; the spool itself is never removed.
    assert.match(mediaService, /dirname\(produced\.localPath\) === uploadTempDir\(\)\n\s+\? await fsp\.mkdtemp/);
  });

  it('leaves no Transloadit behind: packages, env, route, uploader, layouts', () => {
    assert.doesNotMatch(packageJson, /transloadit/);
    // Only the slides generator used the SRT writer.
    assert.doesNotMatch(packageJson, /"subtitle":/);
    assert.doesNotMatch(envExample, /TRANSLOADIT/);
    assert.match(envExample, /#FFMPEG_PATH="ffmpeg"/);
    assert.doesNotMatch(mediaController, /save-media/);
    assert.doesNotMatch(uppy, /transloadit/i);
    assert.doesNotMatch(variables, /transloadit/);
    assert.doesNotMatch(uploader, /transloadit/);
    assert.match(uploader, /const uploadStrategy = uploadViaServer \? 'local' : storageProvider;/);
  });

  it('puts ffmpeg and a subtitle font on the image', () => {
    assert.match(dockerfile, /^\s+ffmpeg \\$/m);
    assert.match(dockerfile, /^\s+fonts-dejavu-core \\$/m);
  });
});
