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
  it('lives in the compose toolbar as a rail switch, not a viewport-edge FAB', () => {
    assert.match(editor, /<ComposeAiAssistant \/>/);
    assert.match(modal, /<StudioRailTabs \/>/);
    assert.match(modal, /<ComposeAiRail \/>/);
    assert.match(assistant, /data-pq="composer-rail-tabs"/);
    assert.doesNotMatch(modal, /bottom-\[104px\]/);
    assert.doesNotMatch(modal, /end-\[24px\]/);
    assert.doesNotMatch(assistant, /bottom-\[104px\]/);
    assert.doesNotMatch(assistant, /position: fixed;\s*bottom: 1rem/);
  });

  it('stays reachable without an OpenAI key and sends that path to Connections', () => {
    assert.match(assistant, /useAiAvailable/);
    assert.match(assistant, /href="\/connections"/);
    assert.match(assistant, /compose_ai_unconfigured_tip/);
    assert.match(assistant, /data-pq-compose-ai-trigger/);
  });

  it('opens CopilotKit as an inline chat that fills the Post Preview rail', () => {
    assert.match(assistant, /<CopilotChat/);
    assert.match(assistant, /data-pq="composer-ai-rail"/);
    assert.match(assistant, /generateImageForPost/);
    assert.match(assistant, /attachMediaToPost/);
    assert.match(assistant, /setRail\(open \? 'preview' : 'assistant'\)/);
    assert.doesNotMatch(assistant, /<CopilotPopup/);
    assert.doesNotMatch(assistant, /usePinCopilotWindow/);
  });

  it('uses a high-contrast filled sparkle and a focused chip, not a brand ring', () => {
    assert.match(assistant, /width="16"/);
    assert.match(assistant, /fill="currentColor"/);
    assert.match(assistant, /text-pqFocused/);
    assert.match(assistant, /bg-pqBrandSoft/);
    assert.match(assistant, /cursor-pointer/);
    assert.match(assistant, /var\(--focused\)/);
    assert.match(assistant, /triggerClassName/);
  });
});
