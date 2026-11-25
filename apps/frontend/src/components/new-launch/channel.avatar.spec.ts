import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  brandMarkBox,
  channelBrandMark,
  channelPlatformIcon,
  channelPlatformLabel,
  isBrandMark,
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
const manageModal = readFileSync(
  fileURLToPath(new URL('./manage.modal.tsx', import.meta.url)),
  'utf8'
);
const youtubeSettings = readFileSync(
  fileURLToPath(
    new URL('./providers/youtube/youtube.provider.tsx', import.meta.url)
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
    // The version tabs mark the active one with the raised surface, not a ring.
    assert.match(selectCurrent, /role="tab"/);
    assert.match(selectCurrent, /aria-selected=\{isActive\}/);
    assert.doesNotMatch(selectCurrent, /inset_0_0_0_1\.5px_var\(--pink\)/);
    assert.match(pickPlatform, /aria-pressed=\{selected\}/);
    assert.match(pickPlatform, /ring-2 ring-pqBrand ring-offset-2/);
    assert.match(pickPlatform, /bg-pqBrandSoft text-pqText/);
    assert.doesNotMatch(pickPlatform, /opacity-40/);
    assert.doesNotMatch(pickPlatform, /bg-customColor29/);
  });
});

describe('YouTube official mark', () => {
  it('is a brand mark, the other networks keep their square icon', () => {
    assert.equal(isBrandMark('youtube'), true);
    assert.equal(isBrandMark('instagram'), false);
    assert.equal(isBrandMark(undefined), false);
    assert.equal(isBrandMark('constructor'), false);
  });

  it('is never shown under 20 px high, nor narrower than the icon it replaces', () => {
    const mark = channelBrandMark('youtube')!;
    for (const size of [12, 14, 16, 20, 24]) {
      const { width, height } = brandMarkBox(mark, size);
      assert.ok(height >= 20 - 0.01, `${size}: ${height}`);
      assert.ok(width >= size);
      assert.ok(Math.abs(width / height - mark.ratio) < 0.01);
    }
    const big = brandMarkBox(mark, 40);
    assert.equal(big.width, 40);
  });

  it('links to the channel by id or handle, else to YouTube', () => {
    const { link } = channelBrandMark('youtube')!;
    assert.equal(
      link('UCabcdefghijklmnopqrstuv'),
      'https://www.youtube.com/channel/UCabcdefghijklmnopqrstuv'
    );
    assert.equal(link('@postqueen'), 'https://www.youtube.com/@postqueen');
    assert.equal(link(''), 'https://www.youtube.com');
    assert.equal(link('@a/../x'), 'https://www.youtube.com');
    assert.equal(link('javascript:alert(1)'), 'https://www.youtube.com');
  });

  it('is dimmed through ChannelAvatar, never through a wrapper around it', () => {
    assert.match(source, /dimClassName/);
    assert.match(source, /MonochromeMark/);
    assert.doesNotMatch(picks, /'grayscale'\n\s*\)}\n\s*>/);
    assert.doesNotMatch(picks, /locked && 'opacity-50 pointer-events-none'/);
    assert.match(picks, /dimClassName=\{clsx\(/);
    assert.doesNotMatch(providers, /: 'grayscale opacity-70 shadow/);
    assert.match(providers, /dimClassName=\{/);
    assert.doesNotMatch(manageModal, /py-\[10px\] opacity-60/);
    assert.match(manageModal, /dimClassName=\{p\.locked \? 'opacity-60'/);
  });

  it('never buries an avatar under a badge wider than itself', () => {
    assert.match(source, /const markFitsBadge =/);
    assert.match(source, /\(!mark \|\| markFitsBadge\)/);
  });

  it('shows the description and names the privacy status on the YouTube settings', () => {
    assert.match(youtubeSettings, /t\('label_description', 'Description'\)/);
    assert.match(youtubeSettings, /youtube_description_is_post_text/);
    assert.match(youtubeSettings, /label="Privacy Status"/);
    assert.match(youtubeSettings, /translationKey="label_privacy_status"/);
  });
});
