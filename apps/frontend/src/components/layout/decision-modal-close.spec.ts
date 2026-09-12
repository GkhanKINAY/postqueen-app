import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const source = readFileSync(
  fileURLToPath(new URL('./new-modal.tsx', import.meta.url)),
  'utf8',
);

const decisionModal = source.slice(
  source.indexOf('export const DecisionModal'),
);
const openDecision = source.slice(source.indexOf('const openDecisionDialog'));

describe('decision overlay close path', () => {
  it('mints an id and closes that overlay from the store, not closeCurrent', () => {
    assert.match(openDecision, /const id = makeId\(20\)/);
    assert.match(openDecision, /queueMicrotask/);
    assert.match(openDecision, /closeById\(id\)/);
    assert.doesNotMatch(
      openDecision.slice(
        0,
        openDecision.indexOf('export const DecisionEverywhere'),
      ),
      /closeCurrent/,
    );
  });

  it('does not ask DecisionModal to close via modal context', () => {
    const body = decisionModal.slice(
      0,
      decisionModal.indexOf('export const decisionModalEmitter'),
    );
    assert.doesNotMatch(body, /closeCurrent/);
    assert.match(body, /onClick=\{\(\) => resolution\(true\)\}/);
  });

  it('falls back to closing the top overlay when closeCurrent has no context id', () => {
    assert.match(source, /const top = stack\[stack\.length - 1\]/);
  });
});
