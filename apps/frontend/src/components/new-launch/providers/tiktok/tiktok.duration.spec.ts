import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const component = readFileSync(
  fileURLToPath(new URL('./tiktok.provider.tsx', import.meta.url)),
  'utf8'
);

describe('TikTok video length is checked against creator_info', () => {
  it('reads the length of the attached video in the browser', () => {
    const hook = component.slice(component.indexOf('const useVideoDuration'));
    assert.match(hook, /video\.preload = 'metadata';/);
    assert.match(hook, /Number\.isFinite\(measured\.duration\)/);
    // A new video or an unmounted composer must not keep an old answer.
    assert.match(hook, /measured\?\.src === src/);
    assert.match(hook, /video\.onloadedmetadata = null;/);
  });

  it("compares it with the creator's own maximum, for Direct Post only", () => {
    assert.match(component, /const maxDuration = creatorInfo\?\.maxDurationSeconds;/);
    assert.match(
      component,
      /const videoTooLong =\s*!isUploadMode &&\s*!!maxDuration &&\s*!!videoDuration &&\s*videoDuration > maxDuration;/
    );
  });

  it('says so, with both numbers, before the post is scheduled', () => {
    assert.match(component, /\{videoTooLong && \(/);
    assert.match(component, /'tiktok_video_too_long'/);
    assert.match(component, /\{ duration: Math\.ceil\(videoDuration\), max: maxDuration \}/);
  });
});
