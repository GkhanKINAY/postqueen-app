import 'reflect-metadata';
import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { applyTrackCookies } from './track.cookies.ts';

const env = { ...process.env };
let set: Record<string, { value: string; options: any }>;
const res = {
  cookie: (name: string, value: string, options: any) => {
    set[name] = { value, options };
  },
} as any;
const req = (cookies: Record<string, string> = {}) => ({ cookies }) as any;

beforeEach(() => {
  set = {};
  process.env.FRONTEND_URL = 'https://app.example.com';
  delete process.env.NOT_SECURED;
});
afterEach(() => {
  process.env = { ...env };
});

describe('the visitor cookies of /t', () => {
  it('sets only the track cookie while the pixel is off', () => {
    delete process.env.FACEBOOK_PIXEL_ACCESS_TOKEN;
    delete process.env.NEXT_PUBLIC_FACEBOOK_PIXEL;
    const ids = applyTrackCookies(req({ fbclid: 'old' }), res, 'abc');
    assert.deepEqual(Object.keys(set), ['track']);
    assert.equal(set.track.options.httpOnly, true);
    assert.equal(set.track.options.secure, true);
    assert.equal(set.track.options.sameSite, 'none');
    assert.equal(ids.fbc, 'old');
    assert.equal(ids.fbp, undefined);
  });

  it('keeps a returning visitor and sets nothing new while the pixel is off', () => {
    delete process.env.NEXT_PUBLIC_FACEBOOK_PIXEL;
    const ids = applyTrackCookies(req({ track: 't1', _fbp: 'fb.1.1.2' }), res);
    assert.deepEqual(set, {});
    assert.equal(ids.uniqueId, 't1');
    assert.equal(ids.fbp, 'fb.1.1.2');
  });

  it("writes Meta's cookies once the pixel and its token are set", () => {
    process.env.FACEBOOK_PIXEL_ACCESS_TOKEN = 'token';
    process.env.NEXT_PUBLIC_FACEBOOK_PIXEL = '123';
    const ids = applyTrackCookies(req(), res, 'abc');
    assert.deepEqual(Object.keys(set).sort(), ['_fbc', '_fbp', 'track']);
    assert.match(ids.fbc!, /^fb\.1\.\d+\.abc$/);
    assert.match(ids.fbp!, /^fb\.1\.\d+\.\d+$/);
    // the pixel reads them, so they are not httpOnly
    assert.equal(set._fbc.options.httpOnly, false);
    assert.equal(set._fbp.options.httpOnly, false);
  });

  it('keeps the same ad click and replaces a new one', () => {
    process.env.FACEBOOK_PIXEL_ACCESS_TOKEN = 'token';
    process.env.NEXT_PUBLIC_FACEBOOK_PIXEL = '123';
    const cookies = { track: 't1', _fbc: 'fb.1.5.abc', _fbp: 'fb.1.5.9' };
    assert.equal(applyTrackCookies(req(cookies), res, 'abc').fbc, 'fb.1.5.abc');
    assert.deepEqual(set, {});
    assert.match(applyTrackCookies(req(cookies), res, 'xyz').fbc!, /\.xyz$/);
    assert.deepEqual(Object.keys(set), ['_fbc']);
  });

  it('drops the cookie flags only when NOT_SECURED is "true"', () => {
    process.env.NOT_SECURED = 'false';
    applyTrackCookies(req(), res);
    assert.equal(set.track.options.secure, true);
    process.env.NOT_SECURED = 'true';
    applyTrackCookies(req(), res);
    assert.equal(set.track.options.secure, undefined);
    assert.equal(set.track.options.sameSite, undefined);
  });
});
