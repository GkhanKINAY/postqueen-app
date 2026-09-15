import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const instagram = readFileSync(
  fileURLToPath(
    new URL('./providers/instagram/instagram.preview.tsx', import.meta.url)
  ),
  'utf8',
);
const facebook = readFileSync(
  fileURLToPath(
    new URL('./providers/facebook/facebook.preview.tsx', import.meta.url)
  ),
  'utf8',
);
const frame = readFileSync(
  fileURLToPath(new URL('./preview-media.tsx', import.meta.url)),
  'utf8',
);
const videoOrImage = readFileSync(
  fileURLToPath(
    new URL(
      '../../../../../libraries/react-shared-libraries/src/helpers/video.or.image.tsx',
      import.meta.url
    )
  ),
  'utf8',
);

describe('post preview media frame', () => {
  it('does not force Instagram into a 585px cover box', () => {
    assert.match(instagram, /PreviewMediaFrame/);
    assert.doesNotMatch(instagram, /h-\[585px\]/);
  });

  it('does not force Facebook into a 280px cover box', () => {
    assert.match(facebook, /PreviewMediaFrame/);
    assert.doesNotMatch(facebook, /h-\[280px\]/);
  });

  it('does not default the Instagram feed card to square', () => {
    assert.match(instagram, /instagramFeedPreviewRange/);
    assert.match(instagram, /fallbackWH=\{range\.fallbackWH\}/);
    assert.doesNotMatch(instagram, /aspect-square/);
    assert.doesNotMatch(instagram, /fallbackWH=\{1\}/);
  });

  it('does not paint an empty 4:5 placeholder for a text-only Instagram post', () => {
    assert.match(instagram, /!!renderContent\?\.\[0\]\?\.images\?\.length &&/);
    assert.doesNotMatch(instagram, /no-video-youtube\.png/);
  });

  it('covers video the same way as stills, instead of stretching', () => {
    assert.match(videoOrImage, /playsInline/);
    assert.match(videoOrImage, /isContain \? 'object-contain' : 'object-cover'/);
    assert.match(frame, /FEED_PREVIEW_FALLBACK_WH/);
  });

  it('shows the channel handle on Instagram, not only the page name', () => {
    assert.match(instagram, /formatChannelHandle\(integration\?\.display\)/);
  });

  it('keeps TikTok, YouTube, and Pinterest in document flow when stacked', () => {
    const tiktok = readFileSync(
      fileURLToPath(
        new URL('./providers/tiktok/tiktok.preview.tsx', import.meta.url)
      ),
      'utf8',
    );
    const youtube = readFileSync(
      fileURLToPath(
        new URL('./providers/youtube/youtube.preview.tsx', import.meta.url)
      ),
      'utf8',
    );
    const pinterest = readFileSync(
      fileURLToPath(
        new URL('./providers/pinterest/pinterest.preview.tsx', import.meta.url)
      ),
      'utf8',
    );
    const hop = readFileSync(
      fileURLToPath(
        new URL('./providers/high.order.provider.tsx', import.meta.url)
      ),
      'utf8',
    );
    const slider = readFileSync(
      fileURLToPath(
        new URL('../third-parties/slider.component.tsx', import.meta.url)
      ),
      'utf8',
    );
    assert.doesNotMatch(tiktok, /absolute left-0 top-0 w-full h-full/);
    assert.doesNotMatch(youtube, /absolute left-0 top-0 w-full h-full/);
    assert.doesNotMatch(pinterest, /absolute left-0 top-0 w-full h-full/);
    assert.match(tiktok, /aspect-\[9\/16\]/);
    assert.match(pinterest, /aspect-\[2\/3\]/);
    assert.match(hop, /relative isolate min-w-0 overflow-hidden/);
    assert.match(hop, /preview-channel-label/);
    assert.match(slider, /Array\.isArray\(list\) \? list : \[\]/);
  });

  it('renders Threads as its own feed card, including text-only posts', () => {
    const provider = readFileSync(
      fileURLToPath(
        new URL('./providers/threads/threads.provider.tsx', import.meta.url)
      ),
      'utf8',
    );
    const preview = readFileSync(
      fileURLToPath(
        new URL('./providers/threads/threads.preview.tsx', import.meta.url)
      ),
      'utf8',
    );
    assert.match(provider, /CustomPreviewComponent: ThreadsPreview/);
    assert.doesNotMatch(provider, /CustomPreviewComponent: undefined/);
    assert.match(preview, /data-pq="threads-preview"/);
    assert.match(preview, /sanitizePreviewHtml/);
    assert.match(preview, /formatChannelHandle\(integration\?\.display\)/);
  });
});
