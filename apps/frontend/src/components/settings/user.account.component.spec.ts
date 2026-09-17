import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const account = readFileSync(
  fileURLToPath(new URL('./user.account.component.tsx', import.meta.url)),
  'utf8'
);
const del = readFileSync(
  fileURLToPath(new URL('./delete-account.component.tsx', import.meta.url)),
  'utf8'
);

describe('Account settings layout', () => {
  it('keeps the name as display text until the pencil opens an editor', () => {
    assert.match(account, /data-pq="account-name"/);
    assert.match(account, /setNameOpen\(true\)/);
    assert.match(account, /aria-label=\{t\('edit'/);
    assert.match(account, /disabled=\{!nameDirty\}/);
    assert.doesNotMatch(
      account,
      /label className="mt-\[12px\] flex flex-col gap-\[5px\]"/
    );
  });

  it('keeps email and password collapsed behind Change until opened', () => {
    assert.match(account, /!emailOpen && \(/);
    assert.match(account, /!passwordOpen && \(/);
    assert.match(account, /send_confirmation/);
  });
});

describe('Delete account confirm', () => {
  it('starts as a danger button and only then asks for email and password', () => {
    assert.match(del, /data-pq="account-delete"/);
    assert.match(del, /const \[open, setOpen\] = useState\(false\)/);
    assert.match(del, /!open \?/);
    assert.match(del, /delete_account_warning/);
    assert.match(del, /role="alert"/);
    assert.match(del, /yes_delete_my_account/);
    assert.match(del, /\/user\/delete-account/);
    assert.match(del, /bg-pqBtnSimple/);
    assert.match(del, /hover:shadow-\[inset_0_0_0_999px_var\(--hover\)\]/);
    assert.doesNotMatch(
      del,
      /w-\[110px\] shrink-0 rounded-\[10px\] bg-transparent/,
    );
  });
});
