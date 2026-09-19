import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const service = readFileSync(
  fileURLToPath(new URL('./posts.service.ts', import.meta.url)),
  'utf8'
);
const updateMedia = service.slice(
  service.indexOf('async updateMedia('),
  service.indexOf('async getPostGroupDebugExport(')
);

describe('convertToJPEG converts every image format that is not a JPEG', () => {
  it('picks the named formats, not "is a PNG" and not "anything else"', () => {
    assert.match(
      updateMedia,
      /m\.type === 'image' &&\s*\['png', 'webp', 'gif', 'avif', 'tif'\]\.some\(\(ext\) =>\s*hasExtension\(m\.path, ext\)/
    );
  });

  it('leaves a file it cannot read or decode as it is, without dropping the list', () => {
    assert.match(updateMedia, /readOrFetch\(m\.url\)\.catch\(\s*\(\): null => null\s*\)/);
    assert.match(updateMedia, /\.toBuffer\(\)\s*\.catch\(\(\): null => null\)/);
    assert.match(updateMedia, /if \(!buffer\) \{\s*return m;/);
    // The write-back flag is only raised once a converted file exists.
    assert.match(
      updateMedia,
      /if \(!buffer\) \{\s*return m;\s*\}\s*imageUpdateNeeded = true;/
    );
  });

  it('lays transparency on white', async () => {
    assert.match(updateMedia, /\.flatten\(\{ background: '#ffffff' \}\)/);
    const clear = await sharp({
      create: {
        width: 2,
        height: 2,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      },
    })
      .png()
      .toBuffer();
    const jpeg = await sharp(clear)
      .flatten({ background: '#ffffff' })
      .jpeg({ quality: 100 })
      .toBuffer();
    const pixel = await sharp(jpeg).raw().toBuffer();
    assert.deepEqual([...pixel.subarray(0, 3)], [255, 255, 255]);
  });

  it('keeps a rotated photo upright', async () => {
    assert.match(
      updateMedia,
      /sharp\(Buffer\.from\(imageBuffer\)\)\s*\.rotate\(\)\s*\.flatten\(/
    );
    // 2x1 pixels stored sideways, tagged "rotate 90 degrees" (orientation 6).
    const sideways = await sharp({
      create: { width: 2, height: 1, channels: 3, background: '#e11d48' },
    })
      .withMetadata({ orientation: 6 })
      .webp()
      .toBuffer();
    const jpeg = await sharp(sideways)
      .rotate()
      .flatten({ background: '#ffffff' })
      .jpeg({ quality: 100 })
      .toBuffer();
    const { width, height, orientation } = await sharp(jpeg).metadata();
    assert.deepEqual({ width, height, orientation }, {
      width: 1,
      height: 2,
      orientation: undefined,
    });
  });

  it('can turn each format the library accepts, except BMP, into a JPEG', async () => {
    const pixel = sharp({
      create: { width: 4, height: 4, channels: 3, background: '#e11d48' },
    });
    for (const format of ['png', 'webp', 'gif', 'avif', 'tiff'] as const) {
      const source = await pixel.clone().toFormat(format).toBuffer();
      const jpeg = await sharp(source).jpeg({ quality: 100 }).toBuffer();
      assert.equal((await sharp(jpeg).metadata()).format, 'jpeg', format);
    }

    // A 1x1 24-bit BMP: sharp has no BMP decoder, which is why the fallback
    // above exists.
    const bmp = Buffer.from(
      '424d3a0000000000000036000000280000000100000001000000010018000000000004000000130b0000130b00000000000000000000ff000000',
      'hex'
    );
    await assert.rejects(sharp(bmp).jpeg().toBuffer());
  });
});
