import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const read = (rel: string) =>
  readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

const chat = read('./agent.chat.tsx');
const card = read('./agent.draft.card.tsx');
const actions = read('./agent.draft.actions.tsx');
const composer = read('../new-launch/compose.ai.assistant.tsx');
const editor = read('../new-launch/editor.tsx');
const tools = read('../../../../../libraries/nestjs-libraries/src/chat/load.tools.service.ts');
const readTool = read('../../../../../libraries/nestjs-libraries/src/chat/tools/post.read.tool.ts');
const listTool = read('../../../../../libraries/nestjs-libraries/src/chat/tools/posts.list.tool.ts');
const scheduleTool = read(
  '../../../../../libraries/nestjs-libraries/src/chat/tools/integration.schedule.post.ts'
);
const toolList = read('../../../../../libraries/nestjs-libraries/src/chat/tools/tool.list.ts');
const postsService = read(
  '../../../../../libraries/nestjs-libraries/src/database/prisma/posts/posts.service.ts'
);

describe('Post operations from the Copilot', () => {
  it('lets a comment wait, on the card, in the composer and over MCP', () => {
    // The card carries a delay per thread item and sends it as the composer does.
    assert.match(card, /delay: index > 0 \? Math\.max\(0, Math\.round\(Number\(post\?\.delay\) \|\| 0\)\) : 0/);
    assert.match(actions, /delay: post\.delay \|\| 0/);
    assert.match(card, /data-pq="agent-draft-delays"/);
    assert.match(chat, /name: 'delay',\s*type: 'number'/);
    // The composer sets it through the store, with Undo, and the model reads
    // the current delays beside the content.
    assert.match(composer, /name: 'setCommentDelay'/);
    assert.match(composer, /setInternalDelay\(current, index, minutes\)/);
    assert.match(composer, /setGlobalDelay\(index, minutes\)/);
    assert.match(composer, /delayUndoSnapshots\.set\(undoKey/);
    assert.match(editor, /description: COPILOT_READABLE\.delays/);
    assert.match(scheduleTool, /delay: index > 0 \? Number\(p\.delay\) \|\| 0 : 0/);
  });

  it('updates an existing post from a card whose rows are read at the moment of the action', () => {
    assert.match(chat, /name: 'existing',\s*type: 'string'/);
    assert.match(card, /existing: updates\s*\}/);
    // A row that updates a server post never merges with another.
    assert.match(card, /const existing = updates\s*\? undefined/);
    // The ids are the server's, by thread index, read now: the group rotates
    // on every save, so nothing kept from when the card was drawn is used.
    assert.match(actions, /const readExisting = useCallback/);
    assert.match(actions, /current = await readExisting\(group\.existing\)/);
    assert.match(actions, /postsPayload\(known, current\?\.group \|\| makeId\(10\), current\)/);
    assert.match(actions, /\.\.\.\(current\?\.ids\[index\] \? \{ id: current\.ids\[index\] \} : \{\}\)/);
    // A stored media entry keeps its poster and alt text under the card's id.
    assert.match(actions, /current\?\.media\[index\]\?\.find\(\(m\) => m\.id === a\.id\)/);
    // Save changes keeps the post's date; a moved date is a schedule, and a
    // date that has passed is refused rather than published at once.
    assert.match(actions, /action === 'update'\s*\? current\?\.publishDate/);
    assert.match(actions, /dayjs\.utc\(date\)\.isBefore\(dayjs\.utc\(\)\)/);
    // Edit in Create Post on an existing post opens the calendar's edit path.
    assert.match(actions, /fetch\(`\/posts\/group\/\$\{current\.group\}`\)/);
    assert.match(actions, /<ExistingDataContextProvider value=\{existing\}>/);
    // A saved outcome's key survives the delay field: a delay of 0 is not hashed.
    assert.match(card, /posts\.map\(\(\{ delay, \.\.\.rest \}\) => \(delay \? \{ \.\.\.rest, delay \} : rest\)\)/);
    // Publishing a published post again is asked, then sent with `republish`.
    assert.match(actions, /current\?\.state === 'PUBLISHED' && \(action === 'schedule' \|\| action === 'now'\)/);
    assert.match(actions, /\.\.\.\(republish \? \{ republish: true \} : \{\}\)/);
    // The card says what it is.
    assert.match(card, /t\('update_post', 'Update post'\)/);
    assert.match(card, /data-pq=\{existing \? 'agent-draft-update' : 'agent-draft-schedule'\}/);
    assert.match(card, /data-pq="agent-draft-state"/);
    assert.match(chat, /'schedule', 'now', 'draft', 'update'/);
  });

  it('deletes only from the card, behind a confirmation, never from a tool', () => {
    assert.match(card, /data-pq="agent-draft-delete"/);
    assert.match(actions, /if \(action === 'delete'\) \{\s*if \(\s*!\(await deleteDialog\(/);
    assert.match(actions, /fetch\(`\/posts\/\$\{current\.group\}`, \{ method: 'DELETE' \}\)/);
    // Typed actions never include delete; the tool that shows a post says so.
    assert.doesNotMatch(chat, /'schedule', 'now', 'draft', 'update', 'delete'/);
    assert.match(chat, /name: 'showPostCard'/);
    assert.match(chat, /never say you deleted anything/);
    assert.match(tools, /Deleting is only ever done by the user from that card/);
    assert.match(tools, /Nothing you call deletes a post/);
    assert.doesNotMatch(tools, /modal with populated content/);
    assert.doesNotMatch(listTool, /never offer to delete a post/);
  });

  it('reads a post in full and guards the MCP path with the posts quota', () => {
    assert.match(toolList, /PostReadTool,/);
    assert.match(readTool, /id: 'postReadTool'/);
    assert.match(readTool, /delay: p\.delay \|\| 0/);
    assert.match(postsService, /async assertPostsQuota\(orgId: string\)/);
    assert.match(postsService, /section: Sections\.POSTS_PER_MONTH/);
    // Asked once before any row is created, and put into words for the model.
    assert.match(scheduleTool, /await this\._postsService\.assertPostsQuota\(organizationId\);\s*\} catch \(err\) \{\s*if \(err instanceof HttpException && err\.getStatus\(\) === 402\)/);
    // An unknown id is a 404, not a TypeError.
    assert.match(postsService, /if \(!posts\.length\) \{\s*throw new NotFoundException\('Post not found'\)/);
    assert.match(tools, /read it with postReadTool, then call manualPosting with ONE row carrying existing/);
  });
});
