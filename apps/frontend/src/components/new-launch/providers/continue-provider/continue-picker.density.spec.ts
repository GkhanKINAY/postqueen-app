import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  CONTINUE_PICKER_GRID_MAX,
  continuePickerDensity,
  continuePickerSearchText,
  filterContinuePickerItems,
} from './continue-picker.density.ts';

describe('continuePickerDensity', () => {
  it('uses a confirmation layout for a single option', () => {
    assert.equal(continuePickerDensity(1), 'confirm');
  });

  it('does not treat an empty list as a confirmation', () => {
    assert.equal(continuePickerDensity(0), 'grid');
  });

  it('uses a card grid for a handful of options', () => {
    assert.equal(continuePickerDensity(2), 'grid');
    assert.equal(continuePickerDensity(CONTINUE_PICKER_GRID_MAX), 'grid');
  });

  it('uses a searchable list once the grid would overflow', () => {
    assert.equal(continuePickerDensity(CONTINUE_PICKER_GRID_MAX + 1), 'list');
    assert.equal(continuePickerDensity(24), 'list');
  });
});

describe('continuePickerSearchText', () => {
  it('joins top-level string fields and ignores nested picture URLs', () => {
    assert.equal(
      continuePickerSearchText({
        id: 'UC123',
        name: 'GÖKHAN KINAY',
        username: '@gokhankinay',
        picture: { data: { url: 'https://example.test/avatar.jpg' } },
      }),
      'UC123 GÖKHAN KINAY @gokhankinay'
    );
  });
});

describe('filterContinuePickerItems', () => {
  const items = [
    { id: '1', name: 'GÖKHAN KINAY', username: '@gokhankinay' },
    { id: '2', name: 'Studio Channel', username: '@studio' },
    { id: '3', name: 'Clips', username: '@clips' },
  ];

  it('returns everything when the query is blank', () => {
    assert.deepEqual(filterContinuePickerItems(items, '  '), items);
  });

  it('matches name or username, case-insensitively', () => {
    assert.deepEqual(filterContinuePickerItems(items, 'studio'), [items[1]]);
    assert.deepEqual(filterContinuePickerItems(items, '@CLIP'), [items[2]]);
  });
});
