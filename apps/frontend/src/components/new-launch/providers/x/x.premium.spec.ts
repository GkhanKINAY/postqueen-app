import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const read = (rel: string) =>
  readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

const component = read('./x.provider.tsx');
const provider = read(
  '../../../../../../../libraries/nestjs-libraries/src/integrations/social/x.provider.ts'
);

describe('X premium-only settings come from the platform', () => {
  it('reads the subscription, not the verified flag', () => {
    // `verified` is true for blue, business and government alike, so it says
    // yes to accounts X refuses and no to accounts X allows.
    assert.match(component, /subscription\?\.subscriptionType === 'None'/);
    assert.doesNotMatch(component, /withoutPremium = .*verified\b/);
  });

  it('only a platform saying None may remove an option', () => {
    // Loading, a failure, a paid tier and a value this code has not seen all
    // have to leave the full list standing.
    assert.match(component, /withoutPremium\s*\n?\s*\?\s*\[\]/);
    assert.doesNotMatch(component, /isLoading/);
    assert.doesNotMatch(component, /x_premium_options_failed/);
  });

  it('gates both audiences and the article type off the one answer', () => {
    const reply = component.slice(component.indexOf('const whoCanReply'));
    assert.match(reply, /value: 'subscribers'/);
    assert.match(reply, /value: 'verified'/);
    const types = component.slice(component.indexOf('const postTypes'));
    assert.match(types, /value: 'article'/);
  });

  it('clears a choice the account has just been told it cannot use', () => {
    assert.match(component, /setValue\('who_can_reply_post', 'everyone'\)/);
    assert.match(component, /setValue\('post_type', 'post'\)/);
  });

  it('names why the options are missing', () => {
    assert.match(component, /x_premium_only_settings/);
  });

  it('holds the counter to 280 where the server does', () => {
    // The server's maxLength ignores the "Long posts" switch for an account X
    // said has no subscription, so a counter that followed the switch would
    // allow what the save then refuses.
    const limit = component.slice(component.indexOf('maximumCharacters:'));
    assert.match(limit, /subscriptionType !== 'None'/);
    // And the channel's "Long posts" status says 280 rather than 4000.
    const copy = read('../../../launches/settings.modal.tsx');
    const verified = copy.slice(copy.indexOf("option.title === 'Verified'"));
    assert.match(verified, /const on = .*subscriptionType !== 'None'/);
  });
});

describe('subscriptionInfo on the provider', () => {
  it('asks X for the subscription field under user context', () => {
    assert.match(provider, /async subscriptionInfo\(accessToken: string\)/);
    assert.match(provider, /'subscription_type'/);
  });

  it('keeps "X did not say" apart from "X said None"', () => {
    // A fallback here would turn a failed lookup into a positive "no
    // subscription" and take options away from someone who pays for them.
    const method = provider.slice(provider.indexOf('async subscriptionInfo('));
    assert.doesNotMatch(method, /subscription_type \?\? '/);
    assert.match(method, /subscriptionType: .*subscription_type/);
  });
});
