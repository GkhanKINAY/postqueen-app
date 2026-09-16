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
  it('fills the right rail on phone, and docks under the editor on desktop', () => {
    assert.match(modal, /<StudioRailProvider/);
    assert.match(modal, /<StudioRailTabs \/>/);
    assert.match(modal, /ms-auto flex shrink-0 items-center gap-\[8px\]/);
    assert.match(
      assistant,
      /data-pq="composer-rail-tabs"[\s\S]{0,80}className="flex shrink-0 items-center gap-\[2px\]/
    );
    assert.match(modal, /<ComposeAiRail docked \/>/);
    assert.match(modal, /<ComposeAiRail \/>/);
    assert.match(modal, /hasChannels && compactChrome && \(/);
    assert.match(modal, /data-pq="composer-header-extras"/);
    assert.match(modal, /<ComposeAiBindings \/>/);
    assert.match(modal, /data-pq="composer-empty"/);
    assert.match(modal, /data-pq-composer-empty/);
    assert.match(assistant, /<CopilotChat/);
    assert.match(assistant, /data-pq=\{docked \? 'composer-ai-dock' : 'composer-ai-rail'\}/);
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
    assert.match(assistant, /trz agent flex min-h-0 flex-col/);
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
  });

  it('can rewrite the post and generate an attached image', () => {
    assert.match(assistant, /generateImageForPost/);
    assert.match(assistant, /attachMediaToPost/);
    assert.match(assistant, /\/media\/generate-image-with-prompt/);
    assert.match(assistant, /setPosts/);
  });

  it('uses a high-contrast filled sparkle and a focused chip, not a brand ring', () => {
    assert.match(assistant, /width="16"/);
    assert.match(assistant, /fill="currentColor"/);
    assert.match(assistant, /text-pqFocused/);
    assert.match(assistant, /AI assistant/);
    assert.match(assistant, /var\(--focused\)/);
    assert.doesNotMatch(assistant, /text-pqBrand/);
  });
});
