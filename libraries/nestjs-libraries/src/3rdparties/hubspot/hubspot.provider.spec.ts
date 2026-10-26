import 'reflect-metadata';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as nodeModule from 'node:module';
import { afterEach, before, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

// Same loader hook as posts/create.post.spec.ts: the install URL lives in the
// OAuth service, which imports the media service and with it `file-type`.
const canLoad = typeof nodeModule.registerHooks === 'function';
if (canLoad) {
  nodeModule.registerHooks({
    resolve: (specifier, context, next) =>
      specifier === 'file-type'
        ? {
            url: new URL(
              '../../../../../node_modules/file-type/source/index.js',
              import.meta.url
            ).href,
            shortCircuit: true,
          }
        : next(specifier, context),
  });
}

let ThirdPartyManager: any;
let hubspotInstallUrl: () => string | undefined;
before(async () => {
  if (canLoad) {
    await import('./hubspot.provider.ts');
    await import('../heygen/heygen.provider.ts');
    ({ ThirdPartyManager } = await import('../thirdparty.manager.ts'));
    ({ hubspotInstallUrl } = await import(
      '../../database/prisma/oauth/oauth.service.ts'
    ));
  }
});

const saved: Record<string, string | undefined> = {};
const setEnv = (name: string, value: string | undefined) => {
  if (!(name in saved)) {
    saved[name] = process.env[name];
  }
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
};
afterEach(() => {
  for (const [name, value] of Object.entries(saved)) {
    if (value === undefined) {
      delete process.env[name];
    } else {
      process.env[name] = value;
    }
    delete saved[name];
  }
});

const identifiers = () =>
  new ThirdPartyManager(null, null)
    .getAllThirdParties()
    .map((p: { identifier: string }) => p.identifier);

describe('HubSpot install', { skip: !canLoad }, () => {
  it('is not listed, and has no link, until the HubSpot app is configured', () => {
    setEnv('HUBSPOT_APP_CLIENT_ID', 'hub-client');
    setEnv('HUBSPOT_APP_CLIENT_SECRET', undefined);
    assert.equal(hubspotInstallUrl(), undefined);
    assert.ok(!identifiers().includes('hubspot'));
    // the key-based integrations are listed either way
    assert.ok(identifiers().includes('heygen'));
  });

  it('links to the HubSpot consent screen with our callback once it is', () => {
    setEnv('HUBSPOT_APP_CLIENT_ID', 'hub-client');
    setEnv('HUBSPOT_APP_CLIENT_SECRET', 'hub-secret');
    setEnv('NEXT_PUBLIC_BACKEND_URL', 'https://app.postqueen.ai/api');
    const url = new URL(hubspotInstallUrl()!);
    assert.equal(url.origin + url.pathname, 'https://app.hubspot.com/oauth/authorize');
    assert.equal(url.searchParams.get('client_id'), 'hub-client');
    assert.equal(
      url.searchParams.get('redirect_uri'),
      'https://app.postqueen.ai/api/oauth/hubspot/callback'
    );
    assert.ok(!url.toString().includes('hub-secret'));
    const [hubspot] = new ThirdPartyManager(null, null)
      .getAllThirdParties()
      .filter((p: { identifier: string }) => p.identifier === 'hubspot');
    assert.equal(hubspot.installUrl, url.toString());
    assert.doesNotMatch(hubspot.description, /Postiz/i);
  });

  // The callback is public and spends our app secret at HubSpot on every call
  it('caps the public callback per client address, never by a header', () => {
    const controller = readFileSync(
      fileURLToPath(
        new URL(
          '../../../../../apps/backend/src/api/routes/oauth.controller.ts',
          import.meta.url
        )
      ),
      'utf8'
    );
    assert.match(
      controller,
      /@UseGuards\(ThrottlerRealIpGuard\)\s*@Throttle\(\{ default: \{ limit: 30, ttl: 3600000 \} \}\)\s*@Get\('\/hubspot\/callback'\)/
    );
    assert.doesNotMatch(controller, /RealIP/);
  });
});
