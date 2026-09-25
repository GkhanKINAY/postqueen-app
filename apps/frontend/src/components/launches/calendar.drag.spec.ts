import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { dateChangeActionForDrop } from './calendar.drop.ts';

const calendar = readFileSync(
  fileURLToPath(new URL('./calendar.tsx', import.meta.url)),
  'utf8',
);
const moveSheet = readFileSync(
  fileURLToPath(new URL('../layout/move-post-sheet.tsx', import.meta.url)),
  'utf8',
);
const service = readFileSync(
  fileURLToPath(
    new URL(
      '../../../../../libraries/nestjs-libraries/src/database/prisma/posts/posts.service.ts',
      import.meta.url
    ),
  ),
  'utf8',
);

describe('dateChangeActionForDrop', () => {
  it('keeps a draft as a date-only update, never schedule/publish', () => {
    assert.equal(dateChangeActionForDrop('DRAFT'), 'update');
  });

  it('still reschedules queued and published cards', () => {
    assert.equal(dateChangeActionForDrop('QUEUE'), 'schedule');
    assert.equal(dateChangeActionForDrop('PUBLISHED'), 'schedule');
    assert.equal(dateChangeActionForDrop(undefined), 'schedule');
  });
});

describe('calendar drop does not publish drafts', () => {
  it('both week/month and day drop sites use the draft-safe action', () => {
    const uses = [
      ...calendar.matchAll(/dateChangeActionForDrop\(\s*post\?\.state \|\| item\.state\s*\)/g),
    ];
    assert.equal(
      uses.length,
      2,
      'week/month cell and DayHourSection both read list-rail item.state',
    );
  });

  it('never hard-codes schedule as the drop default', () => {
    assert.doesNotMatch(
      calendar,
      /let action: 'schedule' \| 'update' = 'schedule'/,
    );
  });

  it('server changeDate refuses to promote a draft even if the client sends schedule', () => {
    assert.match(
      service,
      /if \(getPostById\?\.state === 'DRAFT'\) \{\s*action = 'update';/s,
    );
  });
});

describe('every reschedule path restarts the publish job', () => {
  it('the touch Move sheet sends the same action as a drop', () => {
    // Without an action the server defaults to `update`, which only rewrites
    // publishDate: the workflow keeps sleeping and posts at the old time.
    assert.match(
      moveSheet,
      /action: dateChangeActionForDrop\(item\.state\)/,
    );
  });

  it('both drop sites opt in to republishing after the modal said so', () => {
    const optIns = [
      ...calendar.matchAll(/\.\.\.\(action === 'schedule' \? \{ republish: true \} : \{\}\)/g),
    ];
    assert.equal(optIns.length, 2, 'week/month cell and DayHourSection');
  });
});
