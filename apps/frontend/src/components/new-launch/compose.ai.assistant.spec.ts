import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const assistant = readFileSync(
  fileURLToPath(new URL('./compose.ai.assistant.tsx', import.meta.url)),
  'utf8',
);
const modal = readFileSync(
  fileURLToPath(new URL('./manage.modal.tsx', import.meta.url)),
  'utf8',
);
const editor = readFileSync(
  fileURLToPath(new URL('./editor.tsx', import.meta.url)),
  'utf8',
);
const generateImage = readFileSync(
  fileURLToPath(new URL('../media/use.generate.image.tsx', import.meta.url)),
  'utf8',
);
const context = readFileSync(
  fileURLToPath(
    new URL(
      '../../../../../libraries/helpers/src/utils/copilot.context.ts',
      import.meta.url,
    ),
  ),
  'utf8',
);

describe('compose AI assistant placement', () => {
  it('fills the Post Preview rail on every viewport, not a dock under the editor', () => {
    assert.match(modal, /<StudioRailProvider/);
    assert.match(modal, /<StudioRailTabs \/>/);
    assert.match(modal, /const tabbedRail = !compactChrome && !maximized/);
    assert.match(modal, /compactChrome \|\| tabbedRail/);
    assert.match(modal, /!compactChrome && hasChannels && maximized && \(/);
    assert.match(
      assistant,
      /data-pq="composer-rail-tabs"[\s\S]{0,80}className="flex shrink-0 items-center gap-\[3px\]/
    );
    assert.doesNotMatch(modal, /<ComposeAiRail docked \/>/);
    assert.doesNotMatch(modal, /h-\[min\(240px,32vh\)\]/);
    assert.match(modal, /data-pq="composer-preview"/);
    assert.match(modal, /data-pq="composer-ai"/);
    assert.match(modal, /w-\[min\(400px,30vw\)\]/);
    assert.match(modal, /<ComposeAiRail \/>/);
    assert.match(modal, /data-pq="composer-footer-tag"/);
    assert.match(modal, /<ComposeAiBindings \/>/);
    assert.match(modal, /data-pq="composer-empty"/);
    assert.match(modal, /data-pq-composer-empty/);
    assert.match(assistant, /<CopilotChat/);
    assert.match(assistant, /trz agent relative flex h-full min-h-0 flex-col/);
    assert.doesNotMatch(assistant, /<CopilotPopup/);
    assert.doesNotMatch(modal, /bottom-\[104px\]/);
    assert.doesNotMatch(modal, /end-\[24px\]/);
    assert.doesNotMatch(assistant, /bottom-\[104px\]/);
    assert.doesNotMatch(assistant, /position: fixed;\s*bottom: 1rem/);
  });

  it('keeps a toolbar chip on tablet that opens the same rail', () => {
    assert.match(editor, /num === 0 && !mobile && !splitComposer && <ComposeAiAssistant \/>/);
  });

  it('stays visible without an OpenAI key and looks like the Agents chatbox', () => {
    assert.match(assistant, /useAiAvailable/);
    assert.match(assistant, /href="\/connections"/);
    assert.match(assistant, /compose_ai_unconfigured_tip/);
    assert.match(assistant, /data-pq="composer-ai-chat"/);
    assert.match(assistant, /className="copilotKitInputContainer"/);
    assert.match(assistant, /className="copilotKitInput flex items-center gap-\[8px\]"/);
    assert.match(assistant, /copilotKitUserMessage/);
    assert.match(assistant, /trz agent relative flex h-full min-h-0 flex-col/);
    assert.match(assistant, /data-pq-compose-ai-trigger/);
  });

  it('sends Rephrase / Shorten / Expand chips as quick edits the server prompt keys on', () => {
    assert.match(assistant, /data-pq="composer-ai-chips"/);
    assert.match(assistant, /t\('rephrase', 'Rephrase'\)/);
    assert.match(assistant, /t\('shorten', 'Shorten'\)/);
    assert.match(assistant, /t\('expand', 'Expand'\)/);
    assert.match(assistant, /t\('more_casual', 'More Casual'\)/);
    assert.match(assistant, /t\('more_formal', 'More Formal'\)/);
    assert.match(assistant, /onSuggestionClick\(suggestion\.message\)/);
    // The label in the person's language plus a marker; the rules live in
    // chat/load.tools.service.ts, and the marker never shows in the bubble.
    assert.match(assistant, /\[quick-edit:\$\{kind\}\]/);
    assert.match(assistant, /UserMessage=\{ComposeAiUserMessage\}/);
    assert.match(assistant, /replace\(QUICK_EDIT_MARK, ''\)/);
    assert.doesNotMatch(assistant, /Then apply it with setPosts/);
    assert.doesNotMatch(assistant, /COPILOT_INSTRUCTIONS/);
    assert.match(assistant, /quick_edits/);
    assert.match(
      assistant,
      /flex h-\[36px\] items-center gap-\[6px\] rounded-\[10px\]/,
    );
    assert.doesNotMatch(assistant, /h-\[28px\].*text-\[12px\]/);
    assert.match(assistant, /min-h-\[36px\] flex-1 resize-none/);
    assert.match(assistant, /<AutoResizingTextarea/);
    assert.match(assistant, /write_something[\s\S]{0,40}Write something/);
    assert.doesNotMatch(assistant, /share_with_the_world/);
    assert.match(assistant, /🔄/);
    assert.match(assistant, /t\('send', 'Send'\)/);
    assert.match(assistant, /Input=\{ComposeAiInput\}/);
    assert.match(assistant, /data-pq="composer-ai-send"/);
  });

  it('shows the Connections card on an empty rail instead of a CopilotKit greeting bubble', () => {
    // CopilotKit 1.66 never fills `useCopilotMessagesContext`; the overlay is
    // hidden by CSS from the first bubble on (agent.chat.spec pins the rule).
    assert.doesNotMatch(assistant, /useCopilotMessagesContext\(/);
    assert.match(assistant, /<ComposeAiEmptyOverlay/);
    assert.match(assistant, /<ComposeAiEmptyHero tip=\{tip\} \/>/);
    assert.match(assistant, /href="\/connections"/);
    assert.match(assistant, /connections_sub/);
    assert.match(assistant, /compose_ai_unconfigured_tip/);
    assert.doesNotMatch(
      assistant,
      /<CopilotChat[\s\S]{0,500}initial:/,
    );
  });

  it('can rewrite the post through an Apply / Undo card and generate an attached image', () => {
    assert.match(assistant, /generateImageForPost/);
    assert.match(assistant, /attachMediaToPost/);
    // One route call for the AI Image modal, the rail's tool and the Copilot
    // page's card: the hook, not a fetch of its own in each.
    assert.match(generateImage, /\/media\/generate-image-with-prompt/);
    assert.doesNotMatch(assistant, /\/media\/generate-image-with-prompt/);
    assert.match(assistant, /useGenerateImage\(\)/);
    // `suggestPost` replaced `setPosts`: a quick edit applies at once with
    // Undo on its card, anything else waits for Apply, and any card can be
    // applied again. The editor keeps its readables and writes nothing.
    assert.match(assistant, /name: 'suggestPost'/);
    assert.match(assistant, /followUp: false/);
    assert.match(assistant, /<SuggestionCard/);
    assert.match(assistant, /data-pq="composer-ai-apply"/);
    assert.match(assistant, /data-pq="composer-ai-undo"/);
    assert.match(assistant, /data-pq="composer-ai-apply-again"/);
    assert.match(assistant, /undoSnapshots\.set\(undoKey, applySuggestion\(list\)\)/);
    // Undo of a quick edit the handler applied re-renders through `undone`
    // (`applied` is already null there), and the card keeps paragraph breaks.
    assert.match(assistant, /const \[undone, setUndone\] = useState\(false\)/);
    assert.match(assistant, /stripHtmlValidation\('normal', post \|\| '', false, true\)/);
    assert.match(assistant, /enableInspector=\{false\}/);
    // A generated image is a card with Use / Undo / Regenerate; apply=true
    // attaches at once. The route takes the orientation the channel wants.
    assert.match(assistant, /name: 'generateImageForPost'/);
    assert.match(assistant, /name: 'orientation'/);
    assert.match(assistant, /name: 'apply'/);
    assert.match(assistant, /<ComposerImageCard/);
    assert.match(assistant, /mediaUndoSnapshots\.set\(undoKey, \{ index: at, media: attachMedia\(at, \[image\]\) \}\)/);
    assert.match(assistant, /name: '\*'/);
    assert.doesNotMatch(assistant, /name: 'setPosts'/);
    assert.doesNotMatch(editor, /name: 'setPosts'/);
    // The readable keys are the server prompt's, from one shared module.
    assert.match(editor, /description: COPILOT_READABLE\.posts/);
    assert.match(editor, /description: COPILOT_READABLE\.channel/);
    assert.match(context, /cards: 'Post Preview cards in this chat'/);
    assert.match(context, /posts: 'Current content of posts'/);
    assert.match(context, /channel: 'Composer channel'/);
  });

  it('runs Create Post on the same agent as the Copilot page, in its own thread', () => {
    // A nested provider per composer: the layout-level `/copilot/chat` one
    // served every post ever opened from one shared, promptless chat.
    assert.match(assistant, /export const ComposerCopilotProvider/);
    assert.match(assistant, /runtimeUrl=\{backendUrl \+ '\/copilot\/agent'\}/);
    assert.match(assistant, /surface: 'composer'/);
    assert.match(assistant, /uuid\(\)/);
    const addEdit = readFileSync(
      fileURLToPath(new URL('./add.edit.modal.tsx', import.meta.url)),
      'utf8',
    );
    assert.match(addEdit, /<ComposerCopilotProvider>\s*<ManageModal/);
  });

  it('keeps the composer chat with the post it wrote', () => {
    // The thread id rides on the post's provider settings like `pq_notify`:
    // written only once the chat was used, never for Sets or the JSON mode,
    // and read back to reopen a draft on the same thread.
    assert.match(context, /export const PQ_AI_THREAD_SETTING = 'pq_ai_thread'/);
    assert.match(assistant, /existingData\?\.settings\?\.\[PQ_AI_THREAD_SETTING\]/);
    assert.match(modal, /!addEditSets && !dummy && copilotThread\.used\(\)/);
    assert.match(modal, /\[PQ_AI_THREAD_SETTING\]: copilotThread\.threadId/);
    assert.match(modal, /\.\.\.copilotThreadSetting,/);
  });

  it('labels the rail AI Copilot and uses the Agents sparkle, not a filled stand-in', () => {
    assert.match(assistant, /t\('ai_copilot', 'AI Copilot'\)/);
    assert.match(assistant, /M12 3l1\.9 4\.8 4\.8 1\.9/);
    assert.match(assistant, /M18\.5 15\.5l\.8 2 2 \.8/);
    assert.match(assistant, /fill="none"/);
    assert.match(assistant, /stroke="currentColor"/);
    assert.doesNotMatch(assistant, /AI assistant/);
    assert.doesNotMatch(assistant, /fill="currentColor"/);
    assert.match(assistant, /h-\[40px\] min-w-\[132px\]/);
    assert.match(assistant, /text-\[14px\]/);
    assert.match(modal, /t\('ai_copilot', 'AI Copilot'\)/);
    assert.doesNotMatch(modal, /AI assistant/);
  });

  it('locks the rail with the same trial card as the Agents Copilot', () => {
    assert.match(assistant, /<TrialLockCard/);
    assert.match(assistant, /variant="overlay"/);
    assert.match(assistant, /isTrailing/);
    assert.match(assistant, /lifetimePaymentPending/);
    assert.match(assistant, /ai_copilot_unlocks_after_your_trial/);
    assert.match(assistant, /ai_lock_perk_chat/);
  });

  it('opens on AI Copilot and reveals Post Preview once when text or media appears', () => {
    assert.match(modal, /useState<StudioRail>\('assistant'\)/);
    assert.match(modal, /previewRevealedRef/);
    assert.match(modal, /postHasPreviewableContent/);
    assert.match(modal, /previewRevealedRef\.current = true/);
    assert.match(modal, /setStudioRail\('preview'\)/);
    assert.doesNotMatch(modal, /if \(!hasChannels\) \{\s*setStudioRail\('preview'\)/);
    assert.doesNotMatch(editor, /let_ai_write_this_post/);
    assert.doesNotMatch(editor, /pq-compose-ai-hint-off/);
    assert.doesNotMatch(editor, /Connect Claude, ChatGPT, OpenClaw or Hermes/);
  });
});
