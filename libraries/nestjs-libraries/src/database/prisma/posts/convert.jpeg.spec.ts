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

describe('convertToJPEG converts every image that is not a JPEG', () => {
  it('picks images by "not a JPEG", not by "is a PNG"', () => {
    assert.match(
      updateMedia,
      /m\.type === 'image' &&\s*!hasExtension\(m\.path, 'jpg'\) &&\s*!hasExtension\(m\.path, 'jpeg'\)/
    );
    assert.doesNotMatch(updateMedia, /hasExtension\(m\.path, 'png'\)/);
  });

  it('leaves a file sharp cannot read as it is, without dropping the list', () => {
    assert.match(updateMedia, /\.catch\(\(\): null => null\);\s*if \(!buffer\) \{\s*return m;/);
    // The write-back flag is only raised once a converted file exists.
    assert.ok(
      updateMedia.indexOf('imageUpdateNeeded = true;\n              const { path') > -1
    );
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
