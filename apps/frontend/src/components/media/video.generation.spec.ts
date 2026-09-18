import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const read = (rel: string) =>
  readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

const hooks = read('./use.generate.video.tsx');
const card = read('./video.job.card.tsx');
const poster = read('./use.video.poster.tsx');
const capture = read('../../../../../libraries/react-shared-libraries/src/helpers/video.poster.ts');
const uploader = read('./new.uploader.tsx');
const modal = read('../launches/ai.video.tsx');
const composer = read('../new-launch/compose.ai.assistant.tsx');
const chat = read('../agents/agent.chat.tsx');
const actions = read('../agents/agent.draft.actions.tsx');
const controller = read('../../../../backend/src/api/routes/media.controller.ts');
const service = read('../../../../../libraries/nestjs-libraries/src/chat/load.tools.service.ts');
const optionsTool = read(
  '../../../../../libraries/nestjs-libraries/src/chat/tools/generate.video.options.tool.ts'
);
const videoTool = read('../../../../../libraries/nestjs-libraries/src/chat/tools/generate.video.tool.ts');
const frame = read('../../../../../libraries/react-shared-libraries/src/helpers/video.frame.tsx');
const videoOrImage = read('../../../../../libraries/react-shared-libraries/src/helpers/video.or.image.tsx');
const uploads = read('../../app/(app)/api/uploads/[[...path]]/route.ts');
const repository = read(
  '../../../../../libraries/nestjs-libraries/src/database/prisma/media/media.repository.ts'
);

describe('Video generation as a job', () => {
  it('starts on the async route and polls the status route until the job settles', () => {
    assert.match(controller, /@Post\('\/generate-video\/start'\)/);
    assert.match(controller, /@Get\('\/generate-video\/status\/:jobId'\)/);
    // Both take the organization: the status route checks the job id prefix.
    assert.match(
      controller,
      /generateVideoStatus\(\s*@GetOrgFromRequest\(\) org: Organization,\s*@Param\('jobId'\) jobId: string/
    );
    assert.match(hooks, /\/media\/generate-video\/start/);
    assert.match(hooks, /\/media\/generate-video\/status\/\$\{jobId\}/);
    // Polling stops by itself; a finished job is read, not refetched.
    assert.match(hooks, /refreshInterval: \(latest\) =>\s*!latest \|\| latest\.status === 'pending' \? 5000 : 0/);
    assert.match(hooks, /revalidateIfStale: false/);
    assert.match(hooks, /response\.status === 404[\s\S]{0,40}status: 'expired'/);
    // The sync route that held a request open for minutes is no longer called.
    assert.doesNotMatch(modal, /`\/media\/generate-video`/);
    assert.match(modal, /onStarted: \(jobId: string\) => void/);
    assert.match(modal, /useVideoJobResult\(jobId, \{ onReady, onFailed \}\)/);
  });

  it('gives a finished video its poster once, before anyone can attach it', () => {
    assert.match(card, /savePoster\(base\)\.then\(\(thumbnail\) =>/);
    assert.match(card, /settledFor\.current === jobId/);
    assert.match(card, /callbacksRef\.current\?\.onReady\?\.\(done\)/);
    assert.match(card, /callbacksRef\.current\?\.onFailed\?\.\(failure\)/);
    // The same capture the thumbnail picker makes, saved the same way.
    assert.match(capture, /video\.crossOrigin = 'anonymous'/);
    assert.match(capture, /canvas\.toBlob\(\(blob\) => finish\(blob \|\| undefined\), 'image\/jpeg', 0\.8\)/);
    assert.match(poster, /formData\.append\('preventSave', 'true'\)/);
    assert.match(poster, /\/media\/information/);
    assert.match(poster, /if \(media\.thumbnail \|\| !hasExtension\(media\.path, 'mp4'\)\)/);
    // Uploaded videos get one too, in every upload strategy, before the
    // caller hears about them.
    assert.equal(uploader.split('await withPosters(').length - 1, 3);
  });

  it('draws the poster wherever a video frame is drawn', () => {
    assert.match(frame, /poster=\{poster \|\| undefined\}/);
    assert.match(frame, /muted\s+playsInline/);
    assert.match(videoOrImage, /poster=\{poster \|\| undefined\}/);
    // The thumbnail rides through the card's attachments into the post.
    assert.match(actions, /\.\.\.\(a\.thumbnail \? \{ thumbnail: a\.thumbnail \} : \{\}\)/);
    assert.match(repository, /\{ type: 'video' \}/);
  });

  it('serves self-hosted uploads by byte range so a seek does not download the clip', () => {
    assert.match(uploads, /'Accept-Ranges': 'bytes'/);
    assert.match(uploads, /status: 206/);
    assert.match(uploads, /status: 416/);
    assert.match(uploads, /createReadStream\(filePath, \{ start: range\.start, end: range\.end \}\)/);
  });

  it('is one card on both Copilot surfaces, and the model never polls in the app', () => {
    assert.match(composer, /name: 'generateVideoForPost'/);
    assert.match(composer, /<ComposerVideoCard/);
    // Free-form generator params travel as a JSON string (an object schema
    // reaches OpenAI as additionalProperties:false).
    assert.match(composer, /name: 'customParams',\s*type: 'string'/);
    assert.match(chat, /name === 'generateVideoTool' \? \(\s*<AgentVideoCard/);
    assert.match(service, /name !== 'videoStatusTool'/);
    assert.match(service, /'generateVideoOptions',\s*'videoFunctionTool',\s*\]\.includes\(name\)/);
    assert.match(service, /requestContext\.get\('ui' as never\) === 'true'\s*\? uiTools/);
    assert.match(service, /Never poll and never call it twice for one request/);
    assert.match(service, /generateVideoForPost once; the card in the rail waits/);
    assert.match(videoTool, /do not poll/);
    // The options tool names the tool that exists and no longer logs to stdout.
    assert.doesNotMatch(optionsTool, /generateVideoFunction|console\.log/);
    assert.match(optionsTool, /identifier: p\.identifier/);
  });
});
