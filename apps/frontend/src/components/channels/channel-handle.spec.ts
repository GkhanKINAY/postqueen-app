import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { formatChannelHandle } from './channel-handle.ts';

const detailSource = readFileSync(
  fileURLToPath(new URL('./channels.component.tsx', import.meta.url)),
  'utf8',
);

describe('formatChannelHandle', () => {
  it('returns empty when display is missing', () => {
    assert.equal(formatChannelHandle(undefined), '');
    assert.equal(formatChannelHandle(null), '');
    assert.equal(formatChannelHandle('  '), '');
  });

  it('keeps an at-prefixed YouTube customUrl', () => {
    assert.equal(formatChannelHandle('@thegokhankinay'), '@thegokhankinay');
  });

  it('prefixes a bare handle', () => {
    assert.equal(formatChannelHandle('iamgokhankinay'), '@iamgokhankinay');
  });

  it('shows a Tumblr URL as host plus path, without an extra at-sign', () => {
    assert.equal(
      formatChannelHandle('https://thegokhankinay.tumblr.com/'),
      'thegokhankinay.tumblr.com',
    );
    assert.equal(
      formatChannelHandle('https://www.tumblr.com/studio'),
      'tumblr.com/studio',
    );
  });
});

describe('Channels detail handle contract', () => {
  it('renders formatChannelHandle(current.display), not @name', () => {
    assert.match(
      detailSource,
      /formatChannelHandle\(\s*current\?\.display\s*\)/,
    );
    assert.match(detailSource, /\{channelHandle\}/);
    assert.doesNotMatch(detailSource, /current\.name\?\.replace\(\/\^@\//);
  });
});
