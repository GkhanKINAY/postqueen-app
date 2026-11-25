import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const pickerSource = readFileSync(
  fileURLToPath(new URL('./with-continue-provider.tsx', import.meta.url)),
  'utf8',
);
const facebookSource = readFileSync(
  fileURLToPath(new URL('./facebook/facebook.continue.tsx', import.meta.url)),
  'utf8',
);

describe('continue picker multi-select', () => {
  it('toggles checkboxes instead of replacing a radio selection', () => {
    assert.match(pickerSource, /role="checkbox"/);
    assert.match(pickerSource, /toggleContinueSelection/);
    assert.doesNotMatch(pickerSource, /role="radio"/);
  });

  it('sends every selected Facebook page in one Save', () => {
    assert.match(
      facebookSource,
      /Array\.isArray\(selection\) \? \{ pages: selection \}/,
    );
  });

  it('crops page photos to a square, not a circle or a stretched rectangle', () => {
    assert.match(pickerSource, /!rounded-\[12px\]/);
    assert.doesNotMatch(
      pickerSource,
      /\[&_img\]:!rounded-full/,
    );
  });
});

describe('continue picker load', () => {
  // POST /integrations/function answers `false` when the provider call
  // failed. Read as a list it crashed the picker on .filter, read as an empty
  // one it said the account has no pages: it is a failed load.
  it('fails the load on an answer that is not a list', () => {
    assert.match(
      pickerSource,
      /if \(!Array\.isArray\(answer\)\) \{\s*throw new Error\(/,
    );
  });
});

describe('continue picker options that cannot be picked', () => {
  const instagramSource = readFileSync(
    fileURLToPath(
      new URL('./instagram/instagram.continue.tsx', import.meta.url)
    ),
    'utf8',
  );

  it('shows a page not granted in the Facebook dialog, but never as a checkbox', () => {
    for (const source of [facebookSource, instagramSource]) {
      assert.match(source, /item\.disabledReason === 'not_granted'/);
      assert.match(source, /not_selectable_page_not_granted_to_postqueen/);
      assert.doesNotMatch(source, /postiz/i);
    }
    assert.match(
      pickerSource,
      /if \(getDisabledMessage\?\.\(item\)\) \{\s*return \(\s*<div\s*key=\{getItemId\(item\)\}\s*role="checkbox"\s*aria-checked="false"\s*aria-disabled="true"/,
    );
    // Clicking one, Select all and the one-option Save leave it out.
    assert.match(
      pickerSource,
      /if \(getDisabledMessage\?\.\(item\)\) \{\s*return;\s*\}\s*if \(multi\)/,
    );
    assert.match(
      pickerSource,
      /setSelection\(selectableData\.map\(\(item\) => getSelectionValue\(item\)\)\)/,
    );
    assert.match(
      pickerSource,
      /filteredData\.length === 1 && selectableData\.length === 1/,
    );
  });

  it('offers a way back from the full-page landing', () => {
    assert.match(pickerSource, /t\('back_to_postqueen', 'Back to PostQueen'\)/);
    assert.match(pickerSource, /\{hasDisabled && backButton\}/);
  });
});
