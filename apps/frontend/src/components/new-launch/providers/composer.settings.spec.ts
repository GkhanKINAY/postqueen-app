import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const read = (rel: string) =>
  readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

describe('composer channel settings controls', () => {
  it('uses a segmented FormChoice for Post / Story (and similar 2–3 types)', () => {
    const choice = read(
      '../../../../../../libraries/react-shared-libraries/src/form/form.choice.tsx'
    );
    const facebook = read('./facebook/facebook.provider.tsx');
    const instagram = read('./instagram/instagram.collaborators.tsx');
    const x = read('./x/x.provider.tsx');
    const gmb = read('./gmb/gmb.provider.tsx');

    assert.match(choice, /layout\?: 'pills' \| 'segment'/);
    assert.match(choice, /role="radiogroup"/);
    assert.match(facebook, /layout="segment"/);
    assert.match(facebook, /name="post_type"/);
    assert.match(instagram, /layout="segment"/);
    assert.match(instagram, /name="post_type"/);
    assert.match(instagram, /value: 'reel'/);
    assert.match(instagram, /value: 'story'/);
    assert.match(x, /name="post_type"/);
    assert.match(x, /layout="segment"/);
    assert.match(gmb, /name="topicType"/);
    assert.match(gmb, /layout="segment"/);
  });

  it('keeps long catalogs as native selects', () => {
    const facebook = read('./facebook/facebook.provider.tsx');
    const tiktok = read('./tiktok/tiktok.provider.tsx');

    assert.match(facebook, /FACEBOOK_PRESETS\.map/);
    assert.match(facebook, /<Select/);
    assert.match(tiktok, /label_content_posting_method/);
    assert.match(tiktok, /<Select/);
  });

  it('paints FormChoice defaults on first paint and draws named setting icons', () => {
    const choice = read(
      '../../../../../../libraries/react-shared-libraries/src/form/form.choice.tsx'
    );
    const icon = read(
      '../../../../../../libraries/react-shared-libraries/src/form/form.icon.tsx'
    );
    const section = read(
      '../../../../../../libraries/react-shared-libraries/src/form/form.section.tsx'
    );
    const tiktok = read('./tiktok/tiktok.provider.tsx');
    const instagram = read('./instagram/instagram.collaborators.tsx');
    const x = read('./x/x.provider.tsx');

    assert.match(choice, /isEmptyFormValue\(raw\) \? initial : raw/);
    assert.match(choice, /shouldDirty: false/);
    assert.match(choice, /icon\?: FormIconName/);
    assert.match(icon, /export type FormIconName/);
    assert.match(icon, /ai: '✨'/);
    assert.match(icon, /partnership: '🤝'/);
    assert.match(x, /icon="partnership"/);
    assert.match(section, /bg-pqSettings/);
    assert.doesNotMatch(choice, /tiktok/i);
    assert.doesNotMatch(icon, /tiktok/i);
    assert.match(tiktok, /icon="visibility"/);
    assert.match(tiktok, /icon="music"/);
    assert.match(tiktok, /defaultValue="PUBLIC_TO_EVERYONE"/);
    assert.match(tiktok, /defaultValue="DIRECT_POST"/);
    assert.match(x, /placeholder="https:\/\/x.com\/i\/communities\/…"/);
    const finisher = read('../finisher/thread.finisher.tsx');
    assert.match(finisher, /data-pq="composer-thread-finisher"/);
    assert.match(finisher, /thread_finisher_placeholder/);
    assert.match(finisher, /resize-none/);
    assert.doesNotMatch(finisher, /resize-y/);
    assert.doesNotMatch(finisher, /<Editor/);
    const input = read(
      '../../../../../../libraries/react-shared-libraries/src/form/input.tsx'
    );
    assert.match(input, /placeholder:text-pqMuted/);
    assert.match(
      input,
      /color-mix\(in_srgb,var\(--text\)_20%,transparent\)/,
    );
    assert.match(instagram, /defaultValue="post"/);
    assert.match(instagram, /name="post_type"/);
    assert.doesNotMatch(instagram, /name="post_type"[\s\S]{0,80}icon=/);
    assert.doesNotMatch(instagram, /icon="type"/);
    const plugs = read('../../launches/internal.channels.tsx');
    const redditSub = read('./reddit/subreddit.tsx');
    const reddit = read('./reddit/reddit.provider.tsx');
    assert.match(plugs, /<FormSection>/);
    assert.doesNotMatch(plugs, /border-tableBorder/);
    assert.match(redditSub, /<FormSection>/);
    assert.doesNotMatch(redditSub, /bg-primary p-\[20px\]/);
    assert.doesNotMatch(reddit, /bg-red-600/);
  });

  it('keeps the same settings form after the editor when a channel is selected', () => {
    const hop = read('./high.order.provider.tsx');
    const manage = read('../manage.modal.tsx');
    const select = read('../select.current.tsx');
    const linkedin = read('./linkedin/linkedin.provider.tsx');

    assert.match(manage, /id="composer-quick-settings"/);
    assert.match(manage, /data-pq="composer-settings-heading"/);
    assert.match(manage, /t\('settings', 'Settings'\)/);
    assert.match(
      manage,
      /id="social-settings"[\s\S]{0,280}divide-y divide-pqLine overflow-hidden rounded-\[14px\] bg-pqInner/,
    );
    assert.match(
      manage,
      /id="social-settings"[\s\S]{0,280}empty:hidden/,
    );
    assert.doesNotMatch(
      manage,
      /id="social-settings"[\s\S]{0,280}bg-pqLine p-\[1px\]/,
    );
    assert.doesNotMatch(hop, /first:rounded-t-\[13px\]/);
    assert.match(hop, /data-pq="preview-channel-identity"/);
    assert.match(hop, /channelPlatformLabel/);
    assert.match(hop, /data-pq="preview-channel-body"/);
    assert.match(hop, /overflow-hidden rounded-\[12px\] shadow-previewShadow/);
    assert.doesNotMatch(
      hop,
      /border border-borderPreview rounded-\[12px\] shadow-previewShadow/,
    );
    const bodyAt = hop.indexOf('data-pq="preview-channel-body"');
    const bodyGate = hop.slice(
      hop.lastIndexOf('{(tab === 0', bodyAt),
      bodyAt,
    );
    assert.match(bodyGate, /postHasPreview/);
    assert.doesNotMatch(bodyGate, /current \|\| isGlobal/);
    const identityStart = hop.indexOf('data-pq="preview-channel-identity"');
    const identityEnd = hop.indexOf('data-pq="preview-channel-body"');
    const identity = hop.slice(identityStart, identityEnd);
    assert.ok(identityStart > 0 && identityEnd > identityStart);
    assert.doesNotMatch(identity, /formatChannelHandle/);
    assert.doesNotMatch(identity, /integration\.name/);
    assert.match(manage, /w-\[min\(520px,38vw\)\]/);
    assert.ok(
      manage.indexOf('{!hide && <EditorWrapper') <
        manage.indexOf('id="composer-quick-settings"'),
      'channel settings must sit below the post text'
    );
    assert.doesNotMatch(select, /addRemoveInternal\(integration\.id\)/);
    assert.match(select, /setCurrent\(integration\.id\)/);
    const editor = read('../editor.tsx');
    assert.match(editor, /t\('edit_content', 'Edit content'\)/);
    assert.match(editor, /addRemoveInternal\(current\)/);
    assert.match(linkedin, /name="post_as_images_carousel"/);
    assert.match(linkedin, /layout="segment"/);
  });
});
