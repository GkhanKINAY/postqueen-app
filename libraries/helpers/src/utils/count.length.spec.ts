import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { countLength, textSlicer } from './count.length.ts';

describe('countLength', () => {
  it('counts Threads in UTF-8 bytes and everything else in characters', () => {
    assert.equal(countLength('threads', 'café'), 5);
    assert.equal(countLength('linkedin', 'café'), 4);
  });
});

describe('textSlicer for Threads', () => {
  it('crops where the byte count passes the limit, as the counter does', () => {
    // 'é' is two bytes: four of them are eight bytes, so a six-byte limit
    // keeps three.
    assert.deepEqual(textSlicer('threads', 6, 'éééé'), { start: 0, end: 3 });
  });

  it('never cuts an emoji in half', () => {
    // '😀' is four bytes and two UTF-16 units.
    const { end } = textSlicer('threads', 6, 'a😀😀');
    assert.equal(end, 3);
    assert.equal('a😀😀'.slice(0, end), 'a😀');
  });

  it('leaves text that fits alone', () => {
    assert.deepEqual(textSlicer('threads', 500, 'hello'), {
      start: 0,
      end: 500,
    });
  });
});
