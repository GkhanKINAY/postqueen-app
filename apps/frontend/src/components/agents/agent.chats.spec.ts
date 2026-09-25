import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const read = (name: string) =>
  readFileSync(fileURLToPath(new URL(`./${name}`, import.meta.url)), 'utf8');
const agent = read('agent.tsx');
const input = read('agent.input.tsx');
const chat = read('agent.chat.tsx');

describe('Copilot chats list', () => {
  it('renames, deletes and clears through the thread routes', () => {
    assert.match(agent, /fetch\(`\/copilot\/\$\{id\}`, \{\s*method: 'PUT'/);
    assert.match(agent, /fetch\(`\/copilot\/\$\{id\}`, \{ method: 'DELETE' \}\)/);
    assert.match(agent, /fetch\('\/copilot', \{ method: 'DELETE' \}\)/);
  });

  it('asks before a delete and says a busy chat cannot go yet', () => {
    assert.match(agent, /deleteDialog\(\s*t\(\s*'delete_chat_body'/);
    assert.match(agent, /response\.status === 409/);
  });

  it('offers Clear all to admins only', () => {
    assert.match(agent, /const isAdmin = \['ADMIN', 'SUPERADMIN'\]\.includes\(user\?\.role!\)/);
    assert.match(agent, /\{isAdmin && !!threads\.length && \(/);
  });

  it('groups chats by last activity and searches titles', () => {
    assert.match(agent, /newDayjs\(thread\.updatedAt \|\| thread\.createdAt\)/);
    assert.match(agent, /placeholder=\{t\('search_chats', 'Search chats'\)\}/);
  });
});

describe('Copilot channels live in the message box', () => {
  it('both boxes carry the Posting to pill, and the old column is gone', () => {
    assert.match(input, /<ChannelPickerButton \/>/);
    assert.match(chat, /<ChannelPickerButton \/>/);
    assert.doesNotMatch(agent, /data-pq="agent-channel-col"/);
  });

  it('keeps pruning a channel that was deleted or needs a reconnect', () => {
    assert.match(agent, /return row && !needsAttention\(row\);/);
  });

  it('lets a suggestion fill the box without sending it', () => {
    assert.match(chat, /onClick=\{\(\) => seedComposer\(s\.prompt\)\}/);
    const seedEffect = input.slice(
      input.indexOf('if (!composerSeed.n) return;'),
      input.indexOf('}, [composerSeed.n, composerSeed.text]);')
    );
    assert.match(seedEffect, /setText\(composerSeed\.text\)/);
    assert.doesNotMatch(seedEffect, /onSend\(|send\(\)/);
  });
});
