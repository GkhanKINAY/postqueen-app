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
const tools = readFileSync(
  fileURLToPath(
    new URL(
      '../../../../../libraries/nestjs-libraries/src/chat/load.tools.service.ts',
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

  it('paints the draft text, thumbs, channel and date on the card', () => {
    assert.match(card, /stripHtmlValidation\('none'/);
    assert.match(card, /formatDateTime\(dayjs\.utc\(item\.date\)\.local\(\)\)/);
    assert.match(card, /ChannelMark/);
    assert.match(card, /h-\[72px\] w-\[72px\]/);
    assert.match(card, /line-clamp-4/);
    assert.match(card, /t\('comments', 'Comments'\)/);
  });

  it('keeps Schedule and Open composer as the two waits, then lets the agent schedule or not', () => {
    assert.match(chat, /User confirmed\. Schedule these posts now with schedulePostTool/);
    assert.match(
      chat,
      /User opened the Create Post composer with this draft/
    );
    assert.match(chat, /Do not call schedulePostTool for this draft/);
    assert.match(chat, /Do not call manualPosting again/);
    assert.match(chat, /<AddEditModal/);
    assert.match(tools, /always call manualPosting/);
    assert.match(tools, /Never call schedulePostTool for a brand-new post before manualPosting/);
    assert.match(tools, /If it returns that the user opened the composer, do NOT call schedulePostTool/);
  });
});
