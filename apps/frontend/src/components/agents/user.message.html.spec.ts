import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { userMessageHtml } from './user.message.html.ts';

describe('userMessageHtml', () => {
  it('shows what a member typed as text', () => {
    assert.equal(
      userMessageHtml('<img src=x onerror="alert(1)"> & <b>hi</b>'),
      '&lt;img src=x onerror=&quot;alert(1)&quot;&gt; &amp; &lt;b&gt;hi&lt;/b&gt;'
    );
  });

  it('turns the composer media lines into the picture and the video', () => {
    const html = userMessageHtml(
      'Look\n[--Media--]Image: https://cdn.example/a.png [id:m1]\nVideo: https://cdn.example/b.mp4 [id:m2]\n[--Media--]'
    );
    assert.match(html, /<img src="https:\/\/cdn\.example\/a\.png"/);
    assert.match(html, /<source src="https:\/\/cdn\.example\/b\.mp4" type="video\/mp4">/);
    assert.doesNotMatch(html, /\[id:/);
  });

  it('keeps a quote in a media URL inside its attribute', () => {
    const html = userMessageHtml(
      'Image: https://cdn.example/a.png"onerror="alert(1)\n'
    );
    assert.doesNotMatch(html, /"onerror="/);
    assert.match(html, /src="https:\/\/cdn\.example\/a\.png&quot;onerror=&quot;alert\(1\)"/);
  });
});
