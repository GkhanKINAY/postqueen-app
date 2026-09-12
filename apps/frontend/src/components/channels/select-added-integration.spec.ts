import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { selectAddedIntegration } from './select-added-integration.ts';

describe('selectAddedIntegration', () => {
  it('returns nothing when added is missing or the list is empty', () => {
    assert.equal(selectAddedIntegration(undefined, 'youtube'), undefined);
    assert.equal(selectAddedIntegration([], 'youtube'), undefined);
    assert.equal(
      selectAddedIntegration([{ id: '1', identifier: 'youtube' }], ''),
      undefined,
    );
    assert.equal(
      selectAddedIntegration([{ id: '1', identifier: 'youtube' }], null),
      undefined,
    );
  });

  it('selects the only integration whose identifier matches added', () => {
    const youtube = { id: 'yt-1', identifier: 'youtube' };
    const list = [
      { id: 'x-1', identifier: 'x' },
      youtube,
      { id: 'ig-1', identifier: 'instagram' },
    ];
    assert.equal(selectAddedIntegration(list, 'youtube'), youtube);
  });

  it('picks the last match in list order when several share a provider', () => {
    const first = { id: 'yt-old', identifier: 'youtube' };
    const last = { id: 'yt-new', identifier: 'youtube' };
    const list = [{ id: 'x-1', identifier: 'x' }, first, last];
    assert.equal(selectAddedIntegration(list, 'youtube'), last);
  });

  it('prefers the newest createdAt when several share a provider', () => {
    const older = {
      id: 'yt-old',
      identifier: 'youtube',
      createdAt: '2026-01-01T00:00:00.000Z',
    };
    const newer = {
      id: 'yt-new',
      identifier: 'youtube',
      createdAt: '2026-09-12T00:00:00.000Z',
    };
    const list = [newer, older];
    assert.equal(selectAddedIntegration(list, 'youtube'), newer);
  });

  it('returns nothing when no identifier matches', () => {
    assert.equal(
      selectAddedIntegration([{ id: 'x-1', identifier: 'x' }], 'youtube'),
      undefined,
    );
  });
});
