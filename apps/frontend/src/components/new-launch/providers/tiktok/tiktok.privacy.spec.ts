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

  it('asks for it in a dropdown with nothing preselected', () => {
    // Guideline 2b: a dropdown, no default value. Just this Select, not the
    // posting-method one after it, which carries defaultValue="DIRECT_POST".
    const start = component.indexOf("label_who_can_see_this_video',\n                  'Who can see this video?'");
    const block = component.slice(start, component.indexOf('</Select>', start));
    assert.ok(start > -1, 'privacy Select not found');
    assert.match(block, /\{\.\.\.register\('privacy_level'\)\}/);
    assert.match(block, /<option value="">\{t\('select', 'Select'\)\}<\/option>/);
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

  it('keeps Self only listed but not selectable with branded content, and says why', () => {
    // Guideline 3b: branded content cannot be private, in either order.
    assert.match(
      component,
      /disabled: !!\(disclose && brand_content_toggle && option === 'SELF_ONLY'\)/
    );
    assert.match(component, /disabled=\{item\.disabled\}/);
    assert.match(
      component,
      /disabled=\{isUploadMode \|\| privacy_level === 'SELF_ONLY'\}/
    );
    assert.match(component, /tiktok_branded_cannot_be_private/);
  });

  it('clears a level TikTok has withdrawn or branded content has made unavailable', () => {
    assert.match(
      component,
      /option\.value === privacy_level && !option\.disabled/
    );
  });

  it('stops when TikTok says the creator cannot post right now', () => {
    // Guideline 1b: stop the attempt and ask the user to try again later.
    assert.match(component, /creatorInfo\?\.cannotPost \?/);
    assert.match(component, /tiktok_cannot_post_now/);
  });

  it("names the creator's TikTok nickname when the channel was renamed", () => {
    // Guideline 1a; the header above already shows the channel's own name.
    assert.match(component, /creatorInfo\.creatorNickname !== integration\?\.name/);
    assert.match(component, /tiktok_posting_to/);
  });

  it('clears the inert UPLOAD value on the transition, not by value', () => {
    // Inspecting the value instead would throw away a Self only that the
    // creator picked deliberately for a direct post.
    assert.match(component, /const wasUploadMode = useRef\(isUploadMode\)/);
    assert.match(component, /wasUploadMode\.current && !isUploadMode/);
  });

  it('names a TikTok Business video public instead of asking, and still saves', () => {
    // The Business video endpoint has no privacy field and posts publicly;
    // TikTokDto still requires privacy_level, so the true value is carried.
    assert.match(component, /const isPublicVideo = isBusiness && isVideo && !isUploadMode/);
    assert.match(component, /\{isPublicVideo \? \(/);
    assert.match(component, /tiktok_business_video_public/);
    assert.match(component, /setValue\('privacy_level', 'PUBLIC_TO_EVERYONE'\)/);
    // Cleared on the way back to a photo, which offers the dropdown again.
    assert.match(component, /const wasPublicVideo = useRef\(isPublicVideo\)/);
    assert.match(component, /wasPublicVideo\.current && !isPublicVideo/);
    // A private Business account has no PUBLIC_TO_EVERYONE in its list, and
    // the withdrawn-level effect must not clear the carried value for that.
    assert.match(component, /isUploadMode \|\| isPublicVideo \|\| !privacy_level/);
  });

  it('offers Upload to the TikTok inbox on both TikTok tiles', () => {
    assert.match(component, /const isUploadMode = content_posting_method === 'UPLOAD'/);
    assert.doesNotMatch(component, /isBusiness && \(\s*<FormSection\s*hint=\{t\(\s*'choose_upload_without_posting_description'/);
    assert.match(component, /tiktok_upload_inbox_notice/);
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
    const select = read(
      '../../../../../../../libraries/react-shared-libraries/src/form/select.tsx'
    );
    assert.doesNotMatch(choice, /privacy_level|PUBLIC_TO_EVERYONE/);
    assert.doesNotMatch(icon, /privacy_level|PUBLIC_TO_EVERYONE/);
    assert.doesNotMatch(select, /privacy_level|PUBLIC_TO_EVERYONE/);
    // The value → label mapping belongs to TikTok's own component.
    assert.match(component, /const privacyLabels/);
  });
});

describe('TikTok interactions and disclosure follow the guidelines', () => {
  it('leaves Allow Comments off until the creator turns it on', () => {
    // Guideline 2c: none of the interactions is checked by default.
    const start = component.indexOf("label={t('label_comments', 'Allow Comments')}");
    const block = component.slice(start, component.indexOf('/>', start));
    assert.match(block, /defaultValue=\{false\}/);
    assert.match(block, /register\('comment', \{\s*value: false,\s*\}\)/);
  });

  it('hides Duet and Stitch on photo posts without unregistering them', () => {
    // TikTokDto requires duet and stitch, and only these boxes register them:
    // unmounted, a photo-first post could not be saved.
    assert.match(
      component,
      /className=\{clsx\(\s*'flex flex-wrap gap-x-\[20px\] gap-y-\[12px\]',\s*isTitle && 'hidden'\s*\)\}\s*>\s*<Checkbox\s*variant="hollow"\s*icon="duet"/
    );
    assert.doesNotMatch(component, /\{!isTitle && \(\s*<FormSection/);
    // the account notice still explains a comments switch on a photo post
    assert.match(component, /duetOff && !isTitle/);
    const comments = component.indexOf("label={t('label_comments', 'Allow Comments')}");
    assert.ok(component.indexOf('{accountDisabledNotice && (', comments) > comments);
  });

  it('shows the AI label on TikTok photo posts, and on TikTok Business videos only', () => {
    // A photo carries is_aigc on the TikTok tile, so a box left ticked from a
    // video must stay in sight; TikTok Business photos have no such field.
    assert.match(
      component,
      /className=\{clsx\(\s*isTitle && isBusiness && 'invisible h-0 overflow-hidden'\s*\)\}\s*>\s*<FormSection/
    );
    const ai = component.indexOf('icon="ai"');
    const block = component.slice(ai, component.indexOf('/>', ai));
    assert.match(block, /isTitle\s*\?\s*t\('label_made_with_ai', 'Made with AI'\)/);
    assert.match(block, /register\('video_made_with_ai'/);
  });

  it('hides Auto add music on video posts without unregistering it', () => {
    // TikTokDto requires autoAddMusic; on TikTok Business the music and
    // location pickers stay, so only the choice itself is hidden there.
    assert.match(
      component,
      /className=\{clsx\(\s*isVideo && !isBusiness && 'invisible h-0 overflow-hidden'\s*\)\}\s*>\s*<FormSection>\s*<div className=\{clsx\(isVideo && 'invisible h-0 overflow-hidden'\)\}>\s*<FormChoice\s*name="autoAddMusic"/
    );
    assert.doesNotMatch(component, /\{!isVideo && \(\s*<FormChoice/);
  });

  it('labels the post by what was chosen, and refuses a disclosure without one', () => {
    assert.match(component, /your_video_will_be_labeled_paid_partnership/);
    assert.match(component, /your_video_will_be_labeled_promotional/);
    assert.match(component, /tiktok_disclose_choose_brand/);
    assert.match(component, /trigger\('disclose'\)/);
  });

  it('clears the brand boxes when Disclose is turned off, not on mount', () => {
    assert.match(component, /const wasDisclosed = useRef\(disclose\)/);
    assert.match(component, /wasDisclosed\.current && !disclose/);
    assert.match(component, /defaultValue=\{hasBrand\}/);
  });

  it('asks for the music consent on every direct post', () => {
    // Guidelines 2 and 4: not only when a brand option is ticked.
    assert.doesNotMatch(
      component,
      /\(brand_organic_toggle \|\| brand_content_toggle\) && \(\s*<div[^>]*>\s*\{t\(\s*'by_posting_you_agree_to_tiktoks'/
    );
    const consent = component.indexOf("'by_posting_you_agree_to_tiktoks'");
    const brandBlock = component.indexOf("label={t('label_branded_content', 'Branded content')}");
    assert.ok(consent > brandBlock, 'consent line comes after the disclosure section');
    assert.match(component, /music-usage-confirmation/);
    // TikTok's order: "Branded Content Policy and Music Usage Confirmation".
    assert.ok(
      component.indexOf("'branded_content_policy'", consent) <
        component.indexOf("'music_usage_confirmation'", consent)
    );
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
