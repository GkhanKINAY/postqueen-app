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
    assert.match(assistant, /className="copilotKitInput flex items-end gap-\[8px\]"/);
    assert.match(assistant, /copilotKitUserMessage/);
    assert.match(assistant, /trz agent relative flex h-full min-h-0 flex-col/);
    assert.match(assistant, /data-pq-compose-ai-trigger/);
  });

  it('sends Rephrase / Shorten / Expand chips as Copilot commands that call setPosts', () => {
    assert.match(assistant, /data-pq="composer-ai-chips"/);
    assert.match(assistant, /t\('rephrase', 'Rephrase'\)/);
    assert.match(assistant, /t\('shorten', 'Shorten'\)/);
    assert.match(assistant, /t\('expand', 'Expand'\)/);
    assert.match(assistant, /t\('more_casual', 'More Casual'\)/);
    assert.match(assistant, /t\('more_formal', 'More Formal'\)/);
    assert.match(assistant, /onSuggestionClick\(suggestion\.message\)/);
    assert.match(assistant, /Then apply it with setPosts/);
    assert.match(assistant, /quick_edits/);
    assert.match(assistant, /h-\[28px\].*text-\[12px\]/);
    assert.doesNotMatch(
      assistant,
      /flex h-\[36px\] items-center gap-\[6px\] rounded-\[10px\]/,
    );
    assert.match(assistant, /min-h-\[72px\] flex-1 resize-none/);
    assert.match(
      assistant,
      /share_with_the_world[\s\S]{0,80}What do you want to share with the world\?/,
    );
    assert.doesNotMatch(assistant, /write_something/);
    assert.match(assistant, /🔄/);
    assert.match(assistant, /t\('send', 'Send'\)/);
    assert.match(assistant, /Input=\{ComposeAiInput\}/);
    assert.match(assistant, /data-pq="composer-ai-send"/);
  });

  it('can rewrite the post and generate an attached image', () => {
    assert.match(assistant, /generateImageForPost/);
    assert.match(assistant, /attachMediaToPost/);
    assert.match(assistant, /\/media\/generate-image-with-prompt/);
    assert.match(assistant, /setPosts/);
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
