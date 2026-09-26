import 'reflect-metadata';
import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { Seedance } from './seedance.ts';
import {
  IMAGE_CREDIT_COSTS,
  imageCreditCost,
} from '../../database/prisma/subscriptions/pricing.ts';

const seedance = new Seedance();
const realFetch = globalThis.fetch;

// The request the generator would send, caught before it leaves.
const requestFor = async (params: Record<string, unknown>, output: 'vertical' | 'horizontal' = 'vertical') => {
  let body: any;
  globalThis.fetch = (async (_url: string, init: any) => {
    body = JSON.parse(init.body);
    throw new Error('stop');
  }) as any;
  await assert.rejects(
    seedance.process(output, { prompt: 'a harbour at dawn', images: [], ...params } as any),
    /stop/
  );
  return body;
};

afterEach(() => {
  globalThis.fetch = realFetch;
});

describe('Seedance price', () => {
  it('prices the request that names nothing as every video was priced before: fast, 720p, 8 s', () => {
    assert.equal(seedance.cost('vertical', undefined), 3200);
    assert.equal(seedance.cost('vertical', { prompt: 'x', images: [] } as any), 3200);
  });

  it('prices by model, resolution and seconds, the seconds read from a form as text', () => {
    assert.equal(seedance.cost('vertical', { model: 'mini', resolution: '480p', duration: '5' } as any), 250);
    assert.equal(seedance.cost('vertical', { model: 'standard', resolution: '1080p', duration: 8 } as any), 10000);
    assert.equal(seedance.cost('horizontal', { model: 'fast', resolution: '720p', duration: '15' } as any), 6000);
    // priced before validation for the quote: an unknown choice is nothing, not a crash
    assert.equal(seedance.cost('vertical', { model: 'nope' } as any), 0);
  });

  it('refuses a resolution the model does not offer', async () => {
    await assert.rejects(
      seedance.processAndValidate({ prompt: 'x', images: [], model: 'fast', resolution: '1080p' } as any),
      /Seedance fast does not offer 1080p/
    );
    await assert.rejects(
      seedance.processAndValidate({ prompt: 'x', images: [], duration: 20 } as any)
    );
    await seedance.processAndValidate({ prompt: 'x', images: [], model: 'standard', resolution: '1080p' } as any);
  });
});

describe('Seedance request', () => {
  it('sends what it always sent when nothing is chosen', async () => {
    assert.deepEqual(await requestFor({}), {
      model: 'seedance-2.0-fast-text-to-video',
      prompt: 'a harbour at dawn',
      aspect_ratio: '9:16',
      duration: 8,
      quality: '720p',
      generate_audio: true,
    });
  });

  it('names each model the way EvoLink does, and passes the choices on', async () => {
    const standard = await requestFor({ model: 'standard', resolution: '1080p', duration: '10', audio: false }, 'horizontal');
    assert.equal(standard.model, 'seedance-2.0-text-to-video');
    assert.equal(standard.quality, '1080p');
    assert.equal(standard.duration, 10);
    assert.equal(standard.aspect_ratio, '16:9');
    assert.equal(standard.generate_audio, false);
    // an API client's text "false" turns the sound off, it is not sent as text
    assert.equal((await requestFor({ audio: 'false' })).generate_audio, false);
    const mini = await requestFor({ model: 'mini', images: [{ id: '1', path: 'https://x/y.png' }], aspectRatio: '1:1' });
    assert.equal(mini.model, 'seedance-2.0-mini-reference-to-video');
    assert.deepEqual(mini.image_urls, ['https://x/y.png']);
    assert.equal(mini.aspect_ratio, '1:1');
  });
});

describe('Image price', () => {
  it('is by quality, and a portrait or landscape image costs more than a square one', () => {
    assert.equal(imageCreditCost(), IMAGE_CREDIT_COSTS.medium.square);
    assert.equal(imageCreditCost('medium', 'square'), 100);
    for (const quality of ['low', 'medium', 'high'] as const) {
      assert.ok(imageCreditCost(quality, 'portrait') > imageCreditCost(quality, 'square'));
      assert.equal(imageCreditCost(quality, 'portrait'), imageCreditCost(quality, 'landscape'));
    }
    assert.ok(imageCreditCost('low') < imageCreditCost('medium'));
    assert.ok(imageCreditCost('medium') < imageCreditCost('high'));
  });
});
