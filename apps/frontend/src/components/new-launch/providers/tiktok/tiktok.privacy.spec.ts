import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const read = (rel: string) =>
  readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

const component = read('./tiktok.provider.tsx');
const provider = read(
  '../../../../../../../libraries/nestjs-libraries/src/integrations/social/tiktok.provider.ts'
);

describe('TikTok privacy comes from creator_info', () => {
  it('asks the platform instead of carrying a fixed list', () => {
    assert.match(component, /creatorInfo\?\.privacyLevelOptions/);
    // The four-entry literal is gone. Its labels survive as a lookup keyed by
    // whatever TikTok returns, so a value the account cannot use is never an
    // option in the first place.
    assert.match(component, /const privacyLabels/);
    assert.doesNotMatch(component, /value: 'PUBLIC_TO_EVERYONE',/);
  });

  it('preselects nothing, so the creator chooses', () => {
    // Just the FormChoice, not the section after it: the posting-method Select
    // legitimately carries defaultValue="DIRECT_POST".
    const start = component.indexOf('name="privacy_level"');
    const block = component.slice(
      start,
      component.indexOf('options={privacyLevel}', start)
    );
    assert.doesNotMatch(block, /defaultValue=/);
    assert.match(component, /tiktok_privacy_required/);
  });

  it('never guesses a list when the lookup fails', () => {
    assert.match(component, /tiktok_privacy_options_failed/);
    assert.match(component, /retryCreatorInfo\(\)/);
    // A fallback would reintroduce the whole bug: offering a level TikTok
    // refuses, discovered only at publish time.
    assert.doesNotMatch(
      component,
      /privacyLevelOptions\s*\?\?\s*\[\s*'/
    );
  });

  it('drops SELF_ONLY while branded content is on', () => {
    assert.match(
      component,
      /!\(brand_content_toggle && option === 'SELF_ONLY'\)/
    );
  });

  it('clears a level TikTok has withdrawn', () => {
    assert.match(
      component,
      /!privacyLevel\.some\(\(option\) => option\.value === privacy_level\)/
    );
  });

  it('clears the inert UPLOAD value on the transition, not by value', () => {
    // Inspecting the value instead would throw away a Self only that the
    // creator picked deliberately for a direct post.
    assert.match(component, /const wasUploadMode = useRef\(isUploadMode\)/);
    assert.match(component, /wasUploadMode\.current && !isUploadMode/);
  });

  it('respects the account-level interaction switches', () => {
    assert.match(component, /creatorInfo\?\.duetDisabled/);
    assert.match(component, /creatorInfo\?\.stitchDisabled/);
    assert.match(component, /creatorInfo\?\.commentDisabled/);
    assert.match(component, /disabled=\{isUploadMode \|\| duetOff\}/);
    assert.match(component, /disabled=\{isUploadMode \|\| stitchOff\}/);
    assert.match(component, /disabled=\{isUploadMode \|\| commentOff\}/);
    // A greyed control with no reason is the silent failure this replaces.
    assert.match(component, /tiktok_disabled_on_account/);
  });

  it('keeps the provider vocabulary out of the generic form components', () => {
    const choice = read(
      '../../../../../../../libraries/react-shared-libraries/src/form/form.choice.tsx'
    );
    const icon = read(
      '../../../../../../../libraries/react-shared-libraries/src/form/form.icon.tsx'
    );
    assert.doesNotMatch(choice, /privacy_level|PUBLIC_TO_EVERYONE/);
    assert.doesNotMatch(icon, /privacy_level|PUBLIC_TO_EVERYONE/);
    // The value → glyph mapping belongs to TikTok's own component.
    assert.match(component, /const PRIVACY_ICONS/);
  });
});

describe('creatorInfo on the provider', () => {
  it('queries creator_info and returns what the composer needs', () => {
    assert.match(provider, /async creatorInfo\(accessToken: string\)/);
    assert.match(provider, /post\/publish\/creator_info\/query/);
    assert.match(provider, /privacyLevelOptions:/);
    assert.match(provider, /commentDisabled:/);
    assert.match(provider, /duetDisabled:/);
    assert.match(provider, /stitchDisabled:/);
  });

  it('replaces maxVideoLength, which had no callers', () => {
    assert.doesNotMatch(provider, /maxVideoLength\(/);
  });

  it('names the audit gate, which creator_info cannot report', () => {
    const block = provider.slice(
      provider.indexOf('unaudited_client_can_only_post_to_private_accounts'),
      provider.indexOf('url_ownership_unverified')
    );
    assert.match(block, /Self only/);
    // "contact support" was wrong: this is TikTok's app review, and support
    // cannot move it.
    assert.doesNotMatch(block, /contact support/);
  });
});
