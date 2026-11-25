import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { countLength, textSlicer } from './count.length.ts';

describe('countLength', () => {
  it('counts Threads in characters, not UTF-8 bytes', () => {
    assert.equal(countLength('threads', 'café'), 4);
    // Cyrillic and CJK are two and three bytes a character in UTF-8.
    assert.equal(countLength('threads', 'привет'), 6);
    assert.equal(countLength('threads', '你好'), 2);
  });

  it('counts an emoji as one character on Threads', () => {
    // '😀' is two UTF-16 units and one code point.
    assert.equal(countLength('threads', 'a😀'), 2);
    assert.equal(countLength('linkedin', 'a😀'), 3);
  });
});

describe('textSlicer for Threads', () => {
  it('crops after the limit in characters, as the counter does', () => {
    assert.deepEqual(textSlicer('threads', 3, 'éééé'), { start: 0, end: 3 });
    assert.deepEqual(textSlicer('threads', 3, 'привет'), {
      start: 0,
      end: 3,
    });
  });

  it('never cuts an emoji in half', () => {
    const { end } = textSlicer('threads', 2, 'a😀😀');
    assert.equal(end, 3);
    assert.equal('a😀😀'.slice(0, end), 'a😀');
  });

  it('crops exactly where the counter passes the limit', () => {
    const text = 'a😀é你b😀';
    for (let limit = 0; limit <= countLength('threads', text); limit++) {
      const { end } = textSlicer('threads', limit, text);
      assert.equal(countLength('threads', text.slice(0, end)), limit);
    }
  });

  it('leaves text that fits alone', () => {
    assert.deepEqual(textSlicer('threads', 500, 'hello'), {
      start: 0,
      end: 500,
    });
  });
});
