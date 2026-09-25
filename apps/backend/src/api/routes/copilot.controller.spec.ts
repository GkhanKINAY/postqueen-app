import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const controller = readFileSync(
  fileURLToPath(new URL('./copilot.controller.ts', import.meta.url)),
  'utf8'
);

const route = (decorator: string) =>
  controller.slice(controller.indexOf(decorator), controller.indexOf(decorator) + 700);

describe('Copilot chat actions', () => {
  it('lists chats through the service, with their dates', () => {
    assert.match(route("@Get('/list')"), /this\._mastraService\.listThreads\(organization\.id\)/);
  });

  it('renames with a validated body and 404s a chat that is not this workspace\'s', () => {
    const rename = route("@Put('/:thread')");
    assert.match(rename, /@Body\(\) body: ThreadTitleDto/);
    assert.match(rename, /HttpStatus\.NOT_FOUND/);
  });

  it('refuses to delete a chat that is still answering', () => {
    const del = route("@Delete('/:thread')");
    assert.match(del, /result === 'running'/);
    assert.match(del, /HttpStatus\.CONFLICT/);
  });

  it('lets only admins clear every chat', () => {
    const clear = route("@Delete('/')");
    assert.match(clear, /\[AuthorizationActions\.Create, Sections\.AI\]/);
    assert.match(clear, /\[AuthorizationActions\.Create, Sections\.ADMIN\]/);
  });
});
