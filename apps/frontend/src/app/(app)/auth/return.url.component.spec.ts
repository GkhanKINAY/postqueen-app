import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { sameOriginUrl } from './return.url.component.tsx';

const app = 'https://app.postqueen.ai';

describe('sameOriginUrl', () => {
  it('keeps an address on this app, absolute or as a path', () => {
    assert.equal(
      sameOriginUrl(`${app}/oauth/authorize?client_id=x`, app),
      `${app}/oauth/authorize?client_id=x`
    );
    assert.equal(sameOriginUrl('/launches?x=1', app), `${app}/launches?x=1`);
  });

  it('refuses another site, including one written as //host', () => {
    assert.equal(sameOriginUrl('https://evil.example/http', app), null);
    assert.equal(sameOriginUrl('//evil.example/x', app), null);
    assert.equal(sameOriginUrl('https://app.postqueen.ai.evil.example/', app), null);
    assert.equal(sameOriginUrl('http://app.postqueen.ai/x', app), null);
  });

  it('refuses script and data URLs', () => {
    assert.equal(sameOriginUrl('javascript:alert(1)//http', app), null);
    assert.equal(sameOriginUrl('data:text/html,<script>1</script>http', app), null);
  });

  it('refuses nothing to go to', () => {
    assert.equal(sameOriginUrl(null, app), null);
    assert.equal(sameOriginUrl('', app), null);
  });
});
