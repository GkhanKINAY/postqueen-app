import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const login = readFileSync(
  fileURLToPath(new URL('./login.tsx', import.meta.url)),
  'utf8'
);
const register = readFileSync(
  fileURLToPath(new URL('./register.tsx', import.meta.url)),
  'utf8'
);

describe('auth email and password fields', () => {
  it('stacks login and register fields tightly, with example placeholders', () => {
    assert.match(login, /flex flex-col gap-\[8px\] text-textColor/);
    assert.match(register, /flex flex-col gap-\[8px\] text-textColor/);
    assert.match(login, /placeholder=\{t\('email_placeholder', 'name@example.com'\)\}/);
    assert.match(
      register,
      /placeholder=\{t\('email_placeholder', 'name@example.com'\)\}/
    );
    assert.match(login, /placeholder=\{t\('password_placeholder', '••••••••'\)\}/);
    assert.match(
      register,
      /placeholder=\{t\('password_placeholder', '••••••••'\)\}/
    );
    assert.doesNotMatch(login, /placeholder=\{t\('email_address'/);
    assert.doesNotMatch(register, /placeholder=\{t\('email_address'/);
    assert.doesNotMatch(login, /placeholder=\{t\('label_password'/);
    assert.doesNotMatch(register, /placeholder=\{t\('label_password'/);
    assert.doesNotMatch(register, /placeholder=\{t\('label_organization'/);
    assert.match(login, /data-pq="forgot-password"/);
    assert.match(login, /t\('forgot_password', 'Forgot password\?'\)/);
    assert.doesNotMatch(login, /emailEnabled \? \(/);
    assert.match(login, /labelAction=/);
    assert.doesNotMatch(register, /forgot-password/);
    assert.match(register, /by_registering_you_agree_to_our/);
    assert.match(login, /t\('welcome_back', 'Welcome back'\)/);
    assert.match(login, /'sign_in_subtitle'/);
    assert.match(login, /'Log in to access your account\.'/);
    assert.doesNotMatch(login, /PostQueen account/);
    assert.match(
      register,
      /t\('create_your_account', 'Create your account'\)/
    );
    assert.doesNotMatch(login, /title=\{t\('sign_in'/);
    assert.doesNotMatch(register, /title=\{t\('sign_up'/);
    assert.match(register, /t\('sign_up_1', 'Sign up'\)/);
    assert.doesNotMatch(register, /t\('create_account'/);
    assert.match(login, /form\.watch\('email'\)/);
    assert.match(login, /form\.watch\('password'\)/);
    assert.match(login, /disabled=\{!canSubmit\}/);
    assert.match(register, /disabled=\{!canSubmit\}/);
    assert.match(login, /!bg-pqText/);
    assert.match(register, /!bg-pqText/);
  });
});
