import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const chrome = readFileSync(
  fileURLToPath(new URL('./auth-chrome.tsx', import.meta.url)),
  'utf8'
);
const shell = readFileSync(
  fileURLToPath(new URL('./auth-shell.tsx', import.meta.url)),
  'utf8'
);
const register = readFileSync(
  fileURLToPath(new URL('./register.tsx', import.meta.url)),
  'utf8'
);

const layout = readFileSync(
  fileURLToPath(new URL('../../app/(app)/auth/layout.tsx', import.meta.url)),
  'utf8'
);
const appLayout = readFileSync(
  fileURLToPath(new URL('../../app/(app)/layout.tsx', import.meta.url)),
  'utf8'
);

describe('auth mode chrome', () => {
  it('puts create-account next to the logo, keeps the footer, and drops the title tabs', () => {
    assert.match(chrome, /data-pq="auth-header-cta"/);
    assert.match(chrome, /flex w-full items-center justify-between/);
    assert.match(chrome, /t\('create_a_new_account', 'Create a new account'\)/);
    assert.match(chrome, /t\('dont_have_an_account'/);
    assert.match(chrome, /t\('create_one', 'Create one'\)/);
    assert.match(shell, /AuthModeFooter/);
    assert.doesNotMatch(chrome, /AuthModeSwitch/);
    assert.doesNotMatch(shell, /AuthModeSwitch/);
    assert.doesNotMatch(register, /AuthModeSwitch/);
    assert.doesNotMatch(chrome, /create_account_tab/);
    assert.match(
      layout,
      /max-w-\[452px\][\s\S]*AuthNav[\s\S]*AuthFooter/
    );
    // The split is 45/55, not even: the form column is pinned and the product
    // panel takes the rest. Asserting the exact width covers the old 46% and
    // 50/50 shapes without needing a doesNotMatch per superseded value.
    assert.match(layout, /lg:w-\[45%\]/);
    assert.match(layout, /pt-12/);
    assert.doesNotMatch(layout, /py-\[24px\]/);
    assert.match(
      chrome,
      /font-display text-pretty text-\[28px\] font-semibold leading-\[130%\] tracking-\[-1\.12px\] text-pqText/
    );
    assert.match(
      chrome,
      /text-\[16px\] font-normal leading-\[150%\] text-pqMuted/
    );
    assert.match(chrome, /rounded-\[8px\] border border-pqBorder/);
    assert.doesNotMatch(chrome, /rounded-full border border-pqBorder/);
    assert.match(shell, /flex flex-col gap-\[4px\]/);
    assert.match(shell, /authTitleClass/);
    assert.match(shell, /authSubtitleClass/);
    assert.match(
      appLayout,
      /isBillingEnabled\(\) \? 'https:\/\/postqueen\.ai'/
    );
  });
});
