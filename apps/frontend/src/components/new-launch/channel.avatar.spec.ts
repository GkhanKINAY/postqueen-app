import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  channelPlatformIcon,
  channelPlatformLabel,
  isUsableChannelPicture,
} from './channel-picture.ts';

const source = readFileSync(
  fileURLToPath(new URL('./channel.avatar.tsx', import.meta.url)),
  'utf8'
);
const selectCurrent = readFileSync(
  fileURLToPath(new URL('./select.current.tsx', import.meta.url)),
  'utf8'
);
const picks = readFileSync(
  fileURLToPath(new URL('./picks.socials.component.tsx', import.meta.url)),
  'utf8'
);
const pickPlatform = readFileSync(
  fileURLToPath(
    new URL('../launches/helpers/pick.platform.component.tsx', import.meta.url)
  ),
  'utf8'
);
const providers = readFileSync(
  fileURLToPath(
    new URL('./providers/show.all.providers.tsx', import.meta.url)
  ),
  'utf8'
);
const facebookPreview = readFileSync(
  fileURLToPath(
    new URL('./providers/facebook/facebook.preview.tsx', import.meta.url)
  ),
  'utf8'
);
const linkedinPreview = readFileSync(
  fileURLToPath(
    new URL('./providers/linkedin/linkedin.preview.tsx', import.meta.url)
  ),
  'utf8'
);
const tiktokPreview = readFileSync(
  fileURLToPath(
    new URL('./providers/tiktok/tiktok.preview.tsx', import.meta.url)
  ),
  'utf8'
);
const fallbackHelper = readFileSync(
  fileURLToPath(
    new URL(
      '../../../../../libraries/react-shared-libraries/src/helpers/image.with.fallback.tsx',
      import.meta.url
    )
  ),
  'utf8'
);
const safeImage = readFileSync(
  fileURLToPath(
    new URL(
      '../../../../../libraries/react-shared-libraries/src/helpers/safe.image.tsx',
      import.meta.url
    )
  ),
  'utf8'
);

describe('channel avatar fallback', () => {
  it('treats missing and placeholder pictures as unusable', () => {
    assert.equal(isUsableChannelPicture(undefined), false);
    assert.equal(isUsableChannelPicture(null), false);
    assert.equal(isUsableChannelPicture(''), false);
    assert.equal(isUsableChannelPicture('/no-picture.jpg'), false);
    assert.equal(isUsableChannelPicture('  /no-picture.jpg  '), false);
    assert.equal(
      isUsableChannelPicture('https://cdn.example/uploads/no-picture.jpg'),
      false
    );
    assert.equal(
      isUsableChannelPicture('https://cdn.example/pic.jpg'),
      true
    );
  });

  it('names TikTok and Facebook so stacked previews are not anonymous', () => {
    assert.equal(channelPlatformLabel('tiktok'), 'TikTok');
    assert.equal(channelPlatformLabel('facebook'), 'Facebook');
    assert.equal(channelPlatformLabel('instagram'), 'Instagram');
  });

  it('uses the YouTube svg and pngs for every other network', () => {
    assert.equal(
      channelPlatformIcon('youtube'),
      '/icons/platforms/youtube.svg'
    );
    assert.equal(
      channelPlatformIcon('instagram'),
      '/icons/platforms/instagram.png'
    );
  });

  it('is the composer chip face instead of a gray no-picture tile', () => {
    assert.match(source, /object-contain/);
    assert.match(source, /ring-2 ring-pqInner/);
    assert.match(selectCurrent, /<ChannelAvatar/);
    assert.match(picks, /<ChannelAvatar/);
    assert.match(providers, /<ChannelAvatar/);
    assert.match(pickPlatform, /<ChannelAvatar/);
    assert.doesNotMatch(selectCurrent, /fallbackSrc="\/no-picture\.jpg"/);
    assert.doesNotMatch(picks, /fallbackSrc="\/no-picture\.jpg"/);
    assert.doesNotMatch(pickPlatform, /no-picture\.jpg/);
    assert.match(source, /referrerPolicy="no-referrer"/);
    assert.match(source, /useFallbackUntilLoaded/);
  });

  it('keeps the platform icon up until a remote photo actually loads', () => {
    assert.match(fallbackHelper, /useFallbackUntilLoaded/);
    assert.match(fallbackHelper, /new window\.Image\(\)/);
    assert.match(fallbackHelper, /probe\.referrerPolicy = 'no-referrer'/);
    assert.match(safeImage, /\{\.\.\.rest\}/);
    for (const preview of [facebookPreview, linkedinPreview, tiktokPreview]) {
      assert.match(preview, /<ChannelAvatar/);
      assert.doesNotMatch(preview, /no-picture\.jpg/);
    }
  });

  it('draws selected channel rings with box-shadow, not a CSS border plus filter', () => {
    assert.match(picks, /ring-2 ring-pqBrand/);
    assert.doesNotMatch(picks, /border-pqBrand/);
    assert.doesNotMatch(picks, /bg-pqSettings filter /);
    assert.match(selectCurrent, /ring-2 ring-pqPink/);
    assert.match(selectCurrent, /ring-2 ring-pqBrand/);
    assert.doesNotMatch(selectCurrent, /inset_0_0_0_1\.5px_var\(--pink\)/);
    assert.match(pickPlatform, /aria-pressed=\{selected\}/);
    assert.match(pickPlatform, /ring-2 ring-pqBrand ring-offset-2/);
    assert.match(pickPlatform, /bg-pqBrandSoft text-pqText/);
    assert.doesNotMatch(pickPlatform, /opacity-40/);
    assert.doesNotMatch(pickPlatform, /bg-customColor29/);
  });
});
