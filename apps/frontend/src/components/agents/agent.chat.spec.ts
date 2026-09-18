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
  it('shows a Post Preview card that never blocks the run', () => {
    // `handler` + `render`: the card is a tool result the model gets back at
    // once, not a `renderAndWaitForResponse` that held the run (and the chat
    // input) until a button was pressed.
    assert.match(chat, /name: 'manualPosting'/);
    assert.doesNotMatch(chat, /renderAndWaitForResponse/);
    assert.match(chat, /handler: async \(\{ list \}\): Promise<ManualPostingResult>/);
    assert.match(chat, /status: 'shown', cardId/);
    assert.match(chat, /status: 'invalid', cardId, errors/);
    assert.match(chat, /<DraftPreview/);
    assert.match(card, /data-pq="agent-draft-card"/);
    assert.match(card, /t\('post_preview', 'Post Preview'\)/);
    assert.match(card, /data-pq="agent-draft-open"/);
    assert.match(card, /data-pq="agent-draft-schedule"/);
    assert.match(card, /data-pq="agent-draft-now"/);
    assert.match(card, /data-pq="agent-draft-draft"/);
    assert.match(card, /t\('edit_in_composer', 'Edit in Create Post'\)/);
    assert.match(card, /t\('schedule', 'Schedule'\)/);
    assert.match(card, /t\('post_now', 'Post now'\)/);
    assert.match(card, /t\('save_as_draft', 'Save as draft'\)/);
    assert.doesNotMatch(card, /Opening the composer/);
  });

  it('draws the channel\'s own Post Preview, grouped like the composer sends it', () => {
    // The channel's preview component from the provider registry, outside the
    // composer, with the post in IntegrationContext and the settings in a
    // form provider; General when the provider has no custom preview.
    assert.match(card, /Providers\.find\(\(p\) => p\.identifier === channel\.identifier\)/);
    assert.match(card, /getProviderSettingsMeta\(entry\.component\)/);
    assert.match(card, /meta\?\.CustomPreviewComponent \|\| GeneralPreviewComponent/);
    assert.match(card, /<IntegrationContext\.Provider value=\{contextValue\}>/);
    assert.match(card, /<FormProvider \{\.\.\.form\}>/);
    assert.doesNotMatch(card, /identifier === 'instagram'/);
    // Rows that share a date and the same posts are one group.
    assert.match(card, /export const groupDraftItems/);
    assert.match(card, /JSON\.stringify\(\{ date, posts \}\)/);
    assert.match(card, /draftSettings/);
    assert.doesNotMatch(card, /h-\[72px\] w-\[72px\]/);
    assert.doesNotMatch(css, /\[data-pq='agent-draft-card'\] img/);
  });

  it('acts from the card through the same endpoints as Create Post', () => {
    const actions = readFileSync(
      fileURLToPath(new URL('./agent.draft.actions.tsx', import.meta.url)),
      'utf8',
    );
    // What the card shows is what `/posts` receives; the model never re-emits
    // a draft to publish it, and the composer opens as a new post.
    assert.match(actions, /fetch\('\/posts\/valid'/);
    assert.match(actions, /fetch\('\/posts', \{/);
    assert.match(actions, /fetch\('\/posts\/find-slot'\)/);
    assert.match(actions, /type: action/);
    assert.match(actions, /set=\{\{/);
    assert.match(actions, /customClose=\{/);
    assert.doesNotMatch(actions, /ExistingDataContextProvider/);
    assert.doesNotMatch(chat, /ExistingDataContextProvider/);
    // Typing "post it now" goes through the same code path, and only after
    // the person has replied since the card was shown.
    assert.match(chat, /name: 'publishFromCard'/);
    assert.match(chat, /registry\.current\[id\]\.userTurn >= latestUserTurn\.current/);
    assert.match(chat, /await execute\(group, kind, date \|\| undefined\)/);
    // Every backend tool call is a quiet step line.
    assert.match(chat, /name: '\*'/);
    assert.match(chat, /<ToolStep/);
    // The prompt's UI workflow follows the card.
    assert.match(tools, /always call manualPosting/);
    assert.match(tools, /call publishFromCard/);
    assert.match(tools, /Never call schedulePostTool for a brand-new post in the app/);
    assert.match(tools, /if it says the user opened the composer, do NOT call schedulePostTool/);
    assert.match(tools, /requestContext\.get\('ui' as never\) === 'true'/);
    assert.doesNotMatch(tools, /!!ui/);
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
    assert.match(chat, /pq: \{\s*surface: 'agent',/);
    assert.match(agent, /usePathname\(\)/);
    assert.match(agent, /selected=\{properties\}/);
    assert.doesNotMatch(agent, /const \[selected, setSelected\] = useState/);
    assert.match(agent, /\/copilot\/\$\{routeId\}\/state/);
    assert.match(agent, /\/copilot\/\$\{threadId\}\/state/);
    assert.match(agent, /filter\(\(p\) => !!p\.title\)/);
    assert.match(controller, /runner: await this\._mastraService\.threadRunner\(organization\.id\)/);
    assert.match(controller, /@Post\('\/:thread\/state'\)/);
    // The Chats rail polls for a fresh thread's title through SWR's own
    // interval, which switches itself off; no timer arrays in the chat.
    assert.match(agent, /refreshInterval/);
    assert.match(chat, /setAwaitTitle\(threadTitleWait\(threadId\)\)/);
    assert.doesNotMatch(chat, /setTimeout\(\(\) => \{\s*void mutate\(\)/);
    // A failed list must not paint the "no chats yet" empty state.
    assert.match(agent, /if \(!response\.ok\) \{\s*throw new Error\('Could not load chats'\)/);
    // The readable the prompt prints is named once, in the shared module.
    assert.match(chat, /description: COPILOT_READABLE\.cards/);
  });

  it('keeps what the live model pass found from coming back', () => {
    const agent = readFileSync(
      fileURLToPath(new URL('./agent.tsx', import.meta.url)),
      'utf8',
    );
    const card = readFileSync(
      fileURLToPath(new URL('./agent.draft.card.tsx', import.meta.url)),
      'utf8',
    );
    const service = readFileSync(
      fileURLToPath(
        new URL(
          '../../../../../libraries/nestjs-libraries/src/chat/load.tools.service.ts',
          import.meta.url,
        ),
      ),
      'utf8',
    );
    // An open `object` parameter reaches the model as `additionalProperties:
    // false`, so settings are a JSON string the card parses.
    assert.match(chat, /name: 'settings',\s*type: 'string'/);
    assert.match(card, /typeof settings === 'string'/);
    // Three invalid drafts, then the model is told to stop; the agent has a
    // step cap so no loop can run away.
    assert.match(chat, /const MAX_INVALID_DRAFTS = 3/);
    assert.match(chat, /stop: 'Do not call manualPosting again/);
    assert.match(service, /defaultOptions: \{ maxSteps: 12 \}/);
    // The card rule opens the prompt, ahead of the style section.
    assert.ok(
      service.indexOf('Post text is never written in chat') <
        service.indexOf('# Conversation style'),
    );
    // Redone attempts fold to a step line; ids never show while streaming.
    assert.match(chat, /const superseded =/);
    assert.match(card, /streaming \? \(\s*<Skeleton/);
    // CopilotKit's inspector is a separate switch, on by default on localhost.
    assert.match(chat, /enableInspector=\{false\}/);
    // Channels are written as soon as the thread has an id, and again on title.
    assert.match(agent, /if \(routeId === 'new' \|\| !dirty\.current\)/);
    assert.match(agent, /if \(touched\.current\) \{\s*patch\.channels/);
  });

  it('keeps what the live audit found from coming back', () => {
    const card = readFileSync(
      fileURLToPath(new URL('./agent.draft.card.tsx', import.meta.url)),
      'utf8',
    );
    // Completed turns are already in Mastra memory; the bridge only gets the
    // current turn (plus user messages), or old tool results and follow-up
    // replies are saved again into the wrong message.
    assert.match(controller, /private currentTurnMessages\(/);
    assert.match(controller, /m\?\.role === 'user' \|\| index >= lastUser/);
    assert.match(controller, /req\.body\.body\.messages = this\.currentTurnMessages/);
    // A half-streamed attachment path is not requested as an image.
    assert.match(card, /const completeMediaPath = /);
    assert.match(chat, /groupDraftItems\(args\?\.list, status === 'inProgress'\)/);
    // Post now queues the post; the platform confirms later.
    assert.match(card, /t\('draft_posted_now', 'Publishing now'\)/);
  });

  it('changes a card image in place instead of drawing a new card', () => {
    const agent = readFileSync(
      fileURLToPath(new URL('./agent.tsx', import.meta.url)),
      'utf8',
    );
    const card = readFileSync(
      fileURLToPath(new URL('./agent.draft.card.tsx', import.meta.url)),
      'utf8',
    );
    const service = readFileSync(
      fileURLToPath(
        new URL(
          '../../../../../libraries/nestjs-libraries/src/chat/mastra.service.ts',
          import.meta.url,
        ),
      ),
      'utf8',
    );
    const dto = readFileSync(
      fileURLToPath(
        new URL(
          '../../../../../libraries/nestjs-libraries/src/dtos/copilot/thread.state.dto.ts',
          import.meta.url,
        ),
      ),
      'utf8',
    );
    // Attachments put on a card later live in their own thread-state field,
    // never in the outcome slot (whose presence marks a group as done).
    assert.match(dto, /media\?: Record<string, unknown>/);
    assert.match(service, /if \(body\.media !== undefined\)/);
    assert.match(agent, /useThreadCardMap<\s*\{ id: string; path: string \}\[\]\s*>\(routeId, state\?\.media/);
    // The overlay is applied after grouping (the key hashes the arguments),
    // the registry keeps a card's groups current, and the tool takes a JSON
    // string (an open object would reach the model as additionalProperties: false).
    assert.match(chat, /const drawn = groupDraftItems\(args\?\.list, status === 'inProgress'\)/);
    assert.match(chat, /known\.groups = groups;/);
    assert.match(chat, /name: 'attachToCard'/);
    assert.match(chat, /name: 'attachments',\s*type: 'string'/);
    assert.match(chat, /name === 'generateImageTool' \? \(\s*<AgentImageCard/);
    // The card menu can change or drop the image; the modal opens with the
    // platform's shape.
    assert.match(card, /data-pq="agent-draft-change-image"/);
    assert.match(card, /data-pq="agent-draft-remove-image"/);
    assert.match(chat, /imageOrientationForPlatforms\(/);
    // Media markers carry the media id the model needs for attachments.
    assert.match(chat, /Image: \$\{m\.path\} \[id:\$\{m\.id\}\]/);
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
