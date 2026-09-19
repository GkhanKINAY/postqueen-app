import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const component = readFileSync(
  fileURLToPath(new URL('./gmb.provider.tsx', import.meta.url)),
  'utf8'
);
const offer = component.slice(component.indexOf("topicType === 'OFFER' && ("));

describe('Google Business settings', () => {
  it('no longer offers the deprecated Get Offer button', () => {
    assert.doesNotMatch(component, /GET_OFFER/);
  });

  it('hides the call to action on an offer, which Google ignores', () => {
    assert.match(component, /\{topicType !== 'OFFER' && \(\s*<FormChoice\s*name="callToActionType"/);
    assert.match(component, /\{topicType !== 'OFFER' &&\s*callToActionType &&/);
  });

  it('still hides the URL for a Call button', () => {
    assert.match(component, /callToActionType !== 'CALL'/);
  });

  it("asks an offer for the title and dates Google reads from `event`", () => {
    assert.match(offer, /\{\.\.\.register\('eventTitle'\)\}/);
    assert.match(offer, /\{dates\}/);
    assert.match(component, /register\('eventStartDate'\)/);
    assert.match(component, /register\('eventEndDate'\)/);
  });
});
