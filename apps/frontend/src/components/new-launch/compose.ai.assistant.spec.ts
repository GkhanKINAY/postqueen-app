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
  it('fills the right rail, not a viewport-edge FAB or footer popup', () => {
    assert.match(modal, /<StudioRailProvider/);
    assert.match(modal, /<StudioRailTabs \/>/);
    assert.match(modal, /<ComposeAiRail \/>/);
    assert.match(modal, /<ComposeAiBindings \/>/);
    assert.match(modal, /data-pq="composer-empty"/);
    assert.match(modal, /data-pq-composer-empty/);
    assert.match(assistant, /<CopilotChat/);
    assert.doesNotMatch(assistant, /<CopilotPopup/);
    assert.doesNotMatch(modal, /bottom-\[104px\]/);
    assert.doesNotMatch(modal, /end-\[24px\]/);
    assert.doesNotMatch(assistant, /bottom-\[104px\]/);
    assert.doesNotMatch(assistant, /position: fixed;\s*bottom: 1rem/);
  });

  it('keeps a toolbar chip on desktop that opens the same rail', () => {
    assert.match(editor, /num === 0 && !mobile && <ComposeAiAssistant \/>/);
  });

  it('stays visible without an OpenAI key and sends that path to Connections', () => {
    assert.match(assistant, /useAiAvailable/);
    assert.match(assistant, /href="\/connections"/);
    assert.match(assistant, /compose_ai_unconfigured_tip/);
    assert.match(assistant, /data-pq-compose-ai-trigger/);
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
