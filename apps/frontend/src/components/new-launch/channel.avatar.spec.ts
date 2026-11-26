import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  brandMarkBox,
  brandMarkPlacement,
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
const agents = readFileSync(
  fileURLToPath(new URL('../agents/agent.tsx', import.meta.url)),
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

  it('uses its own files, and leaves the square YouTube icon to the rest of the app', () => {
    const mark = channelBrandMark('youtube')!;
    assert.equal(mark.src, '/icons/platforms/youtube-mark.svg');
    assert.equal(mark.whiteSrc, '/icons/platforms/youtube-mark-white.svg');
    assert.equal(mark.blackSrc, '/icons/platforms/youtube-mark-black.svg');
  });

  it('sits beside an avatar too small to carry it, never on it or nowhere', () => {
    const mark = channelBrandMark('youtube')!;
    for (const size of [22, 24, 28]) {
      assert.deepEqual(brandMarkPlacement(mark, size, 14, true), {
        face: 'photo',
        badge: 'beside',
      });
      // A forced badge, as the agent draft card's stack asks for.
      assert.equal(brandMarkPlacement(mark, size, 12, true, true).badge, 'beside');
    }
    for (const size of [32, 36, 42]) {
      assert.equal(brandMarkPlacement(mark, size, 14, true).badge, 'on');
    }
    assert.equal(brandMarkPlacement(mark, 22, 14, true, false).badge, 'none');
  });

  it('never leaves an empty disc: the initial, or the mark where it fits', () => {
    const mark = channelBrandMark('youtube')!;
    // No photo, or one still loading, on a small avatar: the initial, and the
    // mark beside it.
    assert.deepEqual(brandMarkPlacement(mark, 22, 14, false), {
      face: 'initial',
      badge: 'beside',
    });
    assert.deepEqual(brandMarkPlacement(mark, 28, 14, false), {
      face: 'initial',
      badge: 'beside',
    });
    // Big enough: the face is the mark itself, with no second one.
    assert.deepEqual(brandMarkPlacement(mark, 42, 16, false), {
      face: 'mark',
      badge: 'none',
    });
    assert.match(source, /continuePickerInitial\(/);
    assert.match(source, /placement\.face === 'mark'/);
  });

  it('keeps the other networks faded as a whole, and only spares the mark', () => {
    assert.match(source, /MonochromeMark/);
    // Picker chips: greyed and faded on the chip, as before, except a brand.
    assert.match(picks, /locked && !brand && 'opacity-50'/);
    assert.match(picks, /: !brand && 'grayscale'/);
    assert.match(picks, /dimClassName=\{\s*brand\s*\?/);
    // Preview chips: the whole chip at 70 % and grey, except a brand.
    assert.match(
      providers,
      /'bg-pqSettings grayscale opacity-70 shadow-\[inset_0_0_0_1\.5px_transparent\] hover:opacity-100'/
    );
    assert.match(providers, /brand && !active/);
    // Locked checklist rows: the whole row at 60 %, except a brand.
    assert.match(manageModal, /'opacity-60 shadow-\[inset_0_0_0_1px_var\(--border\)\]'/);
    assert.match(manageModal, /dimClassName=\{brand && p\.locked \? 'opacity-60'/);
    // The agents page hands brand channels to ChannelAvatar.
    assert.match(agents, /isBrandMark\(integration\.identifier\) \? \(\s*<ComposerChannelAvatar/);
    assert.match(agents, /blocked && !brand && 'opacity-60'/);
  });

  it('shows the description and names the privacy status on the YouTube settings', () => {
    assert.match(youtubeSettings, /t\('label_description', 'Description'\)/);
    assert.match(youtubeSettings, /youtube_description_is_post_text/);
    assert.match(youtubeSettings, /label="Privacy Status"/);
    assert.match(youtubeSettings, /translationKey="label_privacy_status"/);
  });
});

describe('YouTube official mark across the app', () => {
  const root = fileURLToPath(new URL('../..', import.meta.url));
  const read = (file: string) => readFileSync(join(root, file), 'utf8');

  it('is checked for wherever a platform icon is drawn', () => {
    // Nothing renders MenuComponent, and the connect hub's cells name no
    // network with a brand mark.
    const exempt = [
      'components/launches/launches.component.tsx',
      'components/public-api/connect-hub.tsx',
    ];
    const drawing = readdirSync(root, { recursive: true })
      .map(String)
      .filter(
        (file) =>
          file.endsWith('.tsx') &&
          !file.endsWith('.spec.tsx') &&
          read(file).includes('/icons/platforms/')
      );
    assert.ok(drawing.length > 15);
    assert.deepEqual(
      drawing.filter(
        (file) => !exempt.includes(file) && !/isBrandMark\(/.test(read(file))
      ),
      []
    );
  });

  it('leads post cards with the mark, on a row no higher than the icon', () => {
    const calendar = read('components/launches/calendar.tsx');
    const panel = read('components/launches/posts.panel.tsx');
    assert.equal(calendar.match(/<BrandMarkLead\b/g)?.length, 4);
    assert.equal(panel.match(/<BrandMarkLead\b/g)?.length, 1);
    assert.match(
      source,
      /className=\{clsx\('flex shrink-0 items-center', markClassName\)\}\s*style=\{\{ height: size \}\}\s*>\s*<PlatformMark/
    );
  });

  it('gives the time of a narrow card room before its photo or mark', () => {
    const calendar = read('components/launches/calendar.tsx');
    // Week cards and month chips query their own width, brand marks only,
    // so the other networks' cards are laid out as before.
    assert.match(calendar, /brand && '@container min-h-\[16px\]'/);
    assert.match(calendar, /brand && '@container',/);
    assert.match(
      calendar,
      /markClassName="@max-\[85px\]:hidden"\s*avatarClassName="@max-\[106px\]:hidden"/
    );
    assert.match(
      calendar,
      /markClassName="@max-\[98px\]:hidden"\s*avatarClassName="@max-\[116px\]:hidden"/
    );
  });
});
