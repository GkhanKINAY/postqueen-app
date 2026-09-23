import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { computeChannelHealth } from './channel.health.ts';

const autopost = readFileSync(
  fileURLToPath(new URL('../autopost/autopost.tsx', import.meta.url)),
  'utf8',
);

const ok = { id: 'ok' };
const broken = { id: 'broken', refreshNeeded: true };
const off = { id: 'off', disabled: true };

describe('computeChannelHealth', () => {
  it('counts a channel that cannot publish against an auto-publish rule', () => {
    assert.deepEqual(computeChannelHealth(['broken'], [ok, broken]), {
      total: 1,
      healthy: 0,
    });
    assert.deepEqual(computeChannelHealth(['ok', 'off'], [ok, off]), {
      total: 2,
      healthy: 1,
    });
  });

  // startAutopost makes drafts on every channel that still exists in draft
  // mode, so a rule there is running whatever state its channels are in.
  it('does not count a broken channel against a draft-mode rule', () => {
    assert.deepEqual(computeChannelHealth(['broken'], [ok, broken], false), {
      total: 1,
      healthy: 1,
    });
    assert.deepEqual(computeChannelHealth([], [broken, off], false), {
      total: 0,
      healthy: 0,
    });
  });

  it('is told which mode each Auto Post rule is in', () => {
    assert.match(autopost, /integrations \|\| \[\],\s*row\.autoPublish\s*\)/);
  });

  it('still reports a draft-mode rule whose channels are gone', () => {
    assert.deepEqual(computeChannelHealth(['deleted'], [ok], false), {
      total: 1,
      healthy: 0,
    });
  });

  it('gives no verdict while the channel list is not there', () => {
    assert.deepEqual(computeChannelHealth(['ok'], [], false), {
      total: 0,
      healthy: 0,
    });
  });
});
