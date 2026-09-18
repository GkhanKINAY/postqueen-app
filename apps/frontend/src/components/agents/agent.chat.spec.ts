import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const chat = readFileSync(
  fileURLToPath(new URL('./agent.chat.tsx', import.meta.url)),
  'utf8',
);
const card = readFileSync(
  fileURLToPath(new URL('./agent.draft.card.tsx', import.meta.url)),
  'utf8',
);
const css = readFileSync(
  fileURLToPath(new URL('../../app/global.css', import.meta.url)),
  'utf8',
);
const tools = readFileSync(
  fileURLToPath(
    new URL(
      '../../../../../libraries/nestjs-libraries/src/chat/load.tools.service.ts',
      import.meta.url
    )
  ),
  'utf8',
);
const backend = readFileSync(
  fileURLToPath(
    new URL('../../../../backend/src/main.ts', import.meta.url)
  ),
  'utf8',
);
const controller = readFileSync(
  fileURLToPath(
    new URL(
      '../../../../backend/src/api/routes/copilot.controller.ts',
      import.meta.url
    )
  ),
  'utf8',
);

describe('AI Copilot draft preview card', () => {
  it('shows a Post Preview card instead of auto-opening Create Post', () => {
    assert.match(chat, /name: 'manualPosting'/);
    assert.match(chat, /<AgentDraftCard/);
    assert.match(chat, /waiting=\{status === 'executing'\}/);
    assert.doesNotMatch(chat, /Opening the composer…/);
    assert.doesNotMatch(chat, /useEffect\(\(\) => \{\s*startModal\(\);/);
    assert.match(card, /data-pq="agent-draft-card"/);
    assert.match(card, /t\('post_preview', 'Post Preview'\)/);
    assert.match(card, /data-pq="agent-draft-open"/);
    assert.match(card, /data-pq="agent-draft-schedule"/);
    assert.match(card, /t\('open_composer', 'Open composer'\)/);
    assert.match(card, /t\('schedule', 'Schedule'\)/);
  });

  it('paints the draft text, channel and date, and media at its real aspect', () => {
    assert.match(card, /stripHtmlValidation\('none'/);
    assert.match(card, /formatDateTime\(dayjs\.utc\(item\.date\)\.local\(\)\)/);
    assert.match(card, /ChannelMark/);
    // The Post Preview frame, not a fixed square crop: a reel and a landscape
    // video used to be the same 72px thumbnail.
    assert.match(card, /<PreviewMediaFrame/);
    assert.match(card, /<PreviewMediaMosaic/);
    assert.match(card, /useMediaDirectory\(\)/);
    assert.doesNotMatch(card, /h-\[72px\] w-\[72px\]/);
    assert.doesNotMatch(card, /object-cover/);
    assert.doesNotMatch(css, /\[data-pq='agent-draft-card'\] img/);
    assert.match(card, /line-clamp-4/);
    assert.match(card, /t\('comments', 'Comments'\)/);
  });

  it('frees the run before Create Post opens, and opens it as a new post', () => {
    assert.match(chat, /User confirmed\. Schedule these posts now with schedulePostTool/);
    assert.match(
      chat,
      /User opened the Create Post composer with this draft/
    );
    assert.match(chat, /Do not call schedulePostTool for this draft/);
    assert.match(chat, /Do not call manualPosting again/);
    assert.match(chat, /<AddEditModal/);
    // `finish` runs before any modal opens; awaiting a save here left the card
    // and the chat stuck when the composer was closed unsaved.
    const opener = chat.slice(chat.indexOf('const openComposer'), chat.indexOf('const schedule ='));
    assert.ok(opener.indexOf('finish(') < opener.indexOf('modals.openModal('));
    assert.doesNotMatch(opener, /await new Promise/);
    // Seeded the way a saved Set is: never the edit path, which showed Delete
    // Post for a post the server had never seen.
    assert.match(opener, /set=\{\{/);
    assert.match(opener, /customClose=/);
    assert.doesNotMatch(chat, /<ExistingDataContextProvider/);
    assert.doesNotMatch(chat, /import \{ ExistingDataContextProvider \}/);
    assert.match(tools, /always call manualPosting/);
    assert.match(tools, /Never call schedulePostTool for a brand-new post before manualPosting/);
    assert.match(tools, /If it returns that the user opened the composer, do NOT call schedulePostTool/);
  });

  it('hides the empty hero from the DOM, not from the dead messages context', () => {
    // CopilotKit 1.66 never fills `useCopilotMessagesContext`, so an overlay
    // gated on it stayed up over the conversation.
    const emptyState = chat.slice(chat.indexOf('const EmptyState'), chat.indexOf('const UnconfiguredAgentShell'));
    assert.doesNotMatch(emptyState, /useCopilotMessagesContext\(/);
    assert.match(css, /\.agent:has\(\.copilotKitMessage\) \[data-copilot-empty='1'\]/);
  });

  it('streams token by token: no gzip on the event stream, no proxy buffering', () => {
    assert.match(backend, /text\/event-stream/);
    assert.match(backend, /compression\.filter\(req, res\)/);
    assert.match(controller, /X-Accel-Buffering/);
    assert.ok(
      controller.indexOf('streamUnbuffered(res)') <
        controller.indexOf('return copilotRuntimeHandler(req, res)')
    );
  });

  it('replays history from the backend and keeps the channels with the thread', () => {
    const agent = readFileSync(
      fileURLToPath(new URL('./agent.tsx', import.meta.url)),
      'utf8',
    );
    // The chat always runs in an explicit thread: `/agents/new` mints one,
    // the address moves to it after the first reply, and the runtime replays
    // a reopened thread on connect, so the old frontend reload is gone.
    assert.doesNotMatch(chat, /LoadMessages/);
    assert.doesNotMatch(chat, /\/copilot\/\$\{idToSet\}\/list/);
    assert.match(chat, /threadId=\{threadId\}/);
    assert.match(chat, /useCopilotChatInternal\(\)/);
    assert.match(chat, /window\.history\.replaceState\(null, '', `\/agents\/\$\{threadId\}`\)/);
    assert.match(chat, /pq: \{ surface: 'agent' \}/);
    assert.match(agent, /usePathname\(\)/);
    assert.match(agent, /selected=\{properties\}/);
    assert.doesNotMatch(agent, /const \[selected, setSelected\] = useState/);
    assert.match(agent, /\/copilot\/\$\{routeId\}\/state/);
    assert.match(agent, /\/copilot\/\$\{threadId\}\/state/);
    assert.match(agent, /filter\(\(p\) => !!p\.title\)/);
    assert.match(controller, /runner: await this\._mastraService\.threadRunner\(organization\.id\)/);
    assert.match(controller, /@Post\('\/:thread\/state'\)/);
  });

  it('lets the composer grow to maxRows instead of scrolling inside one line', () => {
    const textarea = readFileSync(
      fileURLToPath(new URL('./agent.textarea.tsx', import.meta.url)),
      'utf8',
    );
    // The SDK's `flex: 1` (basis 0) pinned the textarea to `min-height` in
    // this column layout; the max height comes from the computed line height
    // on every change, not from a `scrollHeight` snapshot that was 0 on mount.
    assert.match(css, /\.copilotKitInput textarea \{[\s\S]{0,400}flex: 0 0 auto;/);
    assert.match(textarea, /getComputedStyle\(textarea\)/);
    assert.match(textarea, /lineHeight \* maxRows/);
    assert.doesNotMatch(textarea, /useState<number>\(0\)/);
  });

  it('types the markdown like the bubble instead of the SDK defaults', () => {
    assert.match(css, /\.agent \{[\s\S]*?\.copilotKitParagraph,\s*\.copilotKitMarkdownElement \{\s*font-size: inherit;/);
    // The Create Post rail root carries `.agent` too, so it inherits the same
    // rules instead of repeating them.
    assert.match(css, /The rail root also carries `\.agent`/);
  });
});
