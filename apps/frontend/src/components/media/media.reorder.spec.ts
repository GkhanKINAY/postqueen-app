import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  commitMediaOrder,
  mediaOrderUnchanged,
} from './media.reorder.ts';

describe('commitMediaOrder', () => {
  const tokyo = {
    id: 'tokyo',
    path: '/media/tokyo.png',
    thumbnail: '/media/tokyo-thumb.png',
    width: 1080,
    height: 1080,
  };
  const redsim = {
    id: 'redsim',
    path: '/media/redsim.jpg',
    width: 1500,
    height: 1000,
  };
  const portrait = {
    id: 'portrait',
    path: '/media/portrait.jpg',
    width: 1080,
    height: 1350,
  };

  it('keeps id, path, and dimensions after a left/right swap', () => {
    const previous = [tokyo, redsim, portrait];
    const next = [
      { id: 'redsim', chosen: true, selected: false },
      { id: 'tokyo', path: '', width: 120, height: 120 },
      { id: 'portrait' },
    ];

    assert.deepEqual(commitMediaOrder(next, previous), [
      redsim,
      tokyo,
      portrait,
    ]);
  });

  it('does not stamp the 120px thumb size onto a landscape file', () => {
    const previous = [redsim, tokyo];
    const next = [
      { id: 'tokyo', width: 120, height: 120, chosen: true },
      { id: 'redsim', width: 120, height: 120 },
    ];

    const ordered = commitMediaOrder(next, previous);
    assert.equal(ordered[0].path, tokyo.path);
    assert.equal(ordered[0].width, 1080);
    assert.equal(ordered[0].height, 1080);
    assert.equal(ordered[1].path, redsim.path);
    assert.equal(ordered[1].width, 1500);
    assert.equal(ordered[1].height, 1000);
  });

  it('drops sortable holes instead of writing a blank thumb', () => {
    const previous = [tokyo, redsim];
    const ordered = commitMediaOrder(
      [{ id: 'redsim', path: '/media/redsim.jpg' }, undefined, { chosen: true }],
      previous
    );
    assert.deepEqual(ordered, [redsim, tokyo]);
    assert.ok(ordered.every((item) => item.path));
  });

  it('returns the previous list when sortable emits nothing usable', () => {
    assert.deepEqual(commitMediaOrder([undefined, { chosen: true }], [tokyo]), [
      tokyo,
    ]);
    assert.deepEqual(commitMediaOrder([], [tokyo, redsim]), [tokyo, redsim]);
  });
});

describe('mediaOrderUnchanged', () => {
  it('ignores chosen/selected-only writes', () => {
    const media = [{ id: 'a', path: '/a.png' }];
    assert.equal(mediaOrderUnchanged(media, media), true);
    assert.equal(
      mediaOrderUnchanged(
        [{ id: 'a', path: '/a.png' }],
        [{ id: 'a', path: '/a.png' }]
      ),
      true
    );
    assert.equal(
      mediaOrderUnchanged(
        [{ id: 'b', path: '/b.png' }, { id: 'a', path: '/a.png' }],
        [{ id: 'a', path: '/a.png' }, { id: 'b', path: '/b.png' }]
      ),
      false
    );
  });
});
