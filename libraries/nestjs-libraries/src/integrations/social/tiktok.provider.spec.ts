import 'reflect-metadata';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { TiktokProvider } from './tiktok.provider.ts';
import { TiktokBusinessProvider } from './tiktok.business.provider.ts';

const pictures = (count: number, ext = 'jpg') =>
  Array.from({ length: count }, (_, i) => ({ path: `https://cdn.test/${i}.${ext}` }));

// The TikTok tile also measures every photo with sharp, which reads the file
// over the network. These tests are about counts and formats, so each photo
// measures as TikTok allows; the size rule has its own test below.
class MeasuredTiktokProvider extends TiktokProvider {
  constructor(private readonly size = { width: 1080, height: 1920 }) {
    super();
  }

  protected override async getImageDimensions() {
    if (!this.size) {
      throw new Error('measured');
    }
    return this.size;
  }
}

const tiles = [
  ['TikTok', new MeasuredTiktokProvider()],
  ['TikTok Business', new TiktokBusinessProvider()],
] as const;

describe('TikTok photo limits, on both tiles', () => {
  for (const [name, provider] of tiles) {
    it(`${name}: takes up to 35 pictures, not 36`, async () => {
      assert.equal(await provider.checkValidity([pictures(35)]), true);
      assert.equal(
        await provider.checkValidity([pictures(36)]),
        'You can select up to 35 pictures'
      );
    });

    it(`${name}: converts pictures, and refuses the one format it cannot convert`, async () => {
      assert.equal(provider.convertToJPEG, true);
      for (const ext of ['png', 'gif', 'avif', 'tiff', 'webp']) {
        assert.equal(await provider.checkValidity([pictures(2, ext)]), true, ext);
      }
      assert.match(
        String(await provider.checkValidity([pictures(1, 'bmp')])),
        /BMP files cannot be converted/
      );
    });

    it(`${name}: keeps the one-video rule`, async () => {
      assert.equal(
        await provider.checkValidity([[{ path: 'https://cdn.test/a.mp4' }]]),
        true
      );
      assert.equal(
        await provider.checkValidity([
          [{ path: 'https://cdn.test/a.mp4' }, { path: 'https://cdn.test/b.jpg' }],
        ]),
        'Only pictures are supported when selecting multiple items'
      );
    });
  }
});

describe('TikTok photo size, on the TikTok tile', () => {
  it('refuses a 36th picture or a BMP before measuring any of them', async () => {
    const provider = new MeasuredTiktokProvider(null as any);
    assert.equal(
      await provider.checkValidity([pictures(36)]),
      'You can select up to 35 pictures'
    );
    assert.match(
      String(await provider.checkValidity([pictures(1, 'bmp')])),
      /BMP files cannot be converted/
    );
  });

  it('still names a picture over 1080px on its shorter side', async () => {
    const provider = new MeasuredTiktokProvider({ width: 1086, height: 1448 });
    assert.equal(
      await provider.checkValidity([pictures(2)]),
      'Image 1 is 1086x1448, TikTok allows a maximum of 1080px on the shorter side'
    );
  });
});
