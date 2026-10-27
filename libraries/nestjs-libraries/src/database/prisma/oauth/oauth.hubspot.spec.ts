import 'reflect-metadata';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import * as nodeModule from 'node:module';
import { afterEach, before, beforeEach, describe, it } from 'node:test';
import {
  authorizationServerIssuer,
  oauthAppIssuer,
} from '../../../chat/oauth-types.ts';

// Same loader hook as posts/create.post.spec.ts: the service imports the
// media service, whose upload code imports `file-type`, which tsx would
// otherwise resolve to its declarations.
const canLoadService = typeof nodeModule.registerHooks === 'function';
if (canLoadService) {
  nodeModule.registerHooks({
    resolve: (specifier, context, next) =>
      specifier === 'file-type'
        ? {
            url: new URL(
              '../../../../../../node_modules/file-type/source/index.js',
              import.meta.url
            ).href,
            shortCircuit: true,
          }
        : next(specifier, context),
  });
}

let OAuthService: any;
let AuthService: any;
before(async () => {
  process.env.JWT_SECRET = process.env.JWT_SECRET || 'spec-secret';
  if (canLoadService) {
    ({ OAuthService } = await import('./oauth.service.ts'));
    ({ AuthService } = await import(
      '../../../../../helpers/src/auth/auth.service.ts'
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

const verifier = 'a-long-enough-code-verifier-for-the-spec-0123456789';
const challenge = createHash('sha256').update(verifier).digest('base64url');

// A static app with a secret (every app made under Settings > Developers has
// one), and the one authorization the fake repository knows
let app: any;
let authorization: any;
let tokens: Map<string, any>;
const service = () =>
  new OAuthService(
    {
      getAppByClientId: async (clientId: string) =>
        clientId === app.clientId ? app : null,
      findByCode: async (code: string) =>
        authorization.authorizationCode === code ? authorization : null,
      exchangeCodeForToken: async (id: string, token: string) => {
        tokens.set(token, { ...authorization, accessToken: token });
        return { organizationId: 'org-1', organization: { paymentId: null } };
      },
      findByAccessToken: async (token: string) => tokens.get(token) || null,
    },
    {},
    {
      getMembership: async () => ({ disabled: false, user: { deletedAt: null } }),
    }
  );

beforeEach(() => {
  app = {
    id: 'app-1',
    clientId: 'pca_hubspot',
    clientSecret: AuthService?.fixedEncryption('pcs_secret'),
    dynamic: false,
    tokenEndpointAuthMethod: null,
    redirectUrl: 'https://app.hubspot.com/oauth/callback',
    redirectUris: null,
  };
  authorization = {
    id: 'auth-1',
    oauthAppId: 'app-1',
    authorizationCode: AuthService?.fixedEncryption('the-code'),
    codeExpiresAt: new Date(Date.now() + 60_000),
    codeChallenge: challenge,
    redirectUri: null,
  };
  tokens = new Map();
});

const status = async (promise: Promise<unknown>) => {
  try {
    await promise;
    return 'ok';
  } catch (err: any) {
    return `${err.getStatus()} ${err.getResponse()?.error ?? err.getResponse()}`;
  }
};

describe('HubSpot OAuth client, unset', { skip: !canLoadService }, () => {
  beforeEach(() => setEnv('HUBSPOT_OAUTH_CLIENT_ID', undefined));

  it('keeps every static app on its secret', async () => {
    assert.equal(
      await status(
        service().exchangeCodeForToken('the-code', 'pca_hubspot', undefined, verifier)
      ),
      '401 invalid_client'
    );
  });

  it('answers the refresh grant as an unsupported one, and hands out no refresh token', async () => {
    assert.equal(
      await status(service().refreshAccessToken('pca_hubspot', 'pos_x')),
      '400 unsupported_grant_type'
    );
    const token = await service().exchangeCodeForToken(
      'the-code',
      'pca_hubspot',
      'pcs_secret',
      verifier
    );
    assert.equal(token.refresh_token, undefined);
    assert.equal(token.expires_in, undefined);
  });

  it('binds no PKCE challenge to a static app', () => {
    assert.equal(
      service().pkceBinding(app, { codeChallenge: challenge }),
      undefined
    );
  });
});

describe('HubSpot OAuth client, set', { skip: !canLoadService }, () => {
  beforeEach(() => setEnv('HUBSPOT_OAUTH_CLIENT_ID', 'pca_hubspot'));

  it('requires an S256 PKCE challenge at the consent screen', async () => {
    assert.equal(
      await status(service().validateAuthorizationRequest('pca_hubspot', {})),
      '400 code_challenge is required for this client'
    );
    assert.equal(
      await status(
        service().validateAuthorizationRequest('pca_hubspot', {
          codeChallenge: challenge,
          codeChallengeMethod: 'plain',
        })
      ),
      '400 Only the S256 code_challenge_method is supported'
    );
    assert.deepEqual(
      service().pkceBinding(app, {
        codeChallenge: challenge,
        codeChallengeMethod: 'S256',
        redirectUri: 'https://elsewhere.example/cb',
      }),
      { codeChallenge: challenge, codeChallengeMethod: 'S256' }
    );
  });

  it('exchanges a code with PKCE alone, and the refresh token is the access token', async () => {
    const token = await service().exchangeCodeForToken(
      'the-code',
      'pca_hubspot',
      undefined,
      verifier
    );
    assert.match(token.access_token, /^pos_/);
    assert.equal(token.refresh_token, token.access_token);
    assert.equal(token.expires_in, 10 * 365 * 24 * 60 * 60);
  });

  it('still checks a secret that is sent', async () => {
    assert.equal(
      await status(
        service().exchangeCodeForToken('the-code', 'pca_hubspot', 'pcs_wrong', verifier)
      ),
      '401 invalid_client'
    );
  });

  it('refuses a code issued without a challenge when no secret is sent', async () => {
    authorization.codeChallenge = null;
    assert.equal(
      await status(
        service().exchangeCodeForToken('the-code', 'pca_hubspot', undefined, verifier)
      ),
      '400 invalid_grant'
    );
  });

  it('refreshes to the same token while it is live, and to nothing once revoked', async () => {
    const { access_token } = await service().exchangeCodeForToken(
      'the-code',
      'pca_hubspot',
      undefined,
      verifier
    );
    const refreshed = await service().refreshAccessToken(
      'pca_hubspot',
      access_token
    );
    assert.equal(refreshed.access_token, access_token);
    assert.equal(refreshed.refresh_token, access_token);

    assert.equal(
      await status(
        service().refreshAccessToken('pca_hubspot', access_token, 'pcs_wrong')
      ),
      '401 invalid_client'
    );

    // findByAccessToken skips revoked authorizations
    tokens.clear();
    assert.equal(
      await status(service().refreshAccessToken('pca_hubspot', access_token)),
      '400 invalid_grant'
    );
  });

  it('refreshes nothing for another app, or for a client that is not HubSpot', async () => {
    const { access_token } = await service().exchangeCodeForToken(
      'the-code',
      'pca_hubspot',
      undefined,
      verifier
    );
    const stored = AuthService.fixedEncryption(access_token);
    tokens.set(stored, { ...tokens.get(stored), oauthAppId: 'app-2' });
    assert.equal(
      await status(service().refreshAccessToken('pca_hubspot', access_token)),
      '400 invalid_grant'
    );
    assert.equal(
      await status(service().refreshAccessToken('pca_other', access_token)),
      '400 unsupported_grant_type'
    );
  });
});

describe('HubSpot root issuer', () => {
  it('is the origin of the MCP base when that base sits at a domain root', () => {
    setEnv('HUBSPOT_OAUTH_CLIENT_ID', 'pca_hubspot');
    setEnv('NEXT_PUBLIC_BACKEND_URL', 'https://app.postqueen.ai/api');
    setEnv('NEXT_PUBLIC_OVERRIDE_BACKEND_URL', 'https://api.postqueen.ai');
    assert.equal(
      oauthAppIssuer({ dynamic: false, clientId: 'pca_hubspot' }),
      'https://api.postqueen.ai'
    );
    assert.equal(
      oauthAppIssuer({ dynamic: false, clientId: 'pca_other' }),
      authorizationServerIssuer('/mcp-oauth-chatgpt')
    );
  });

  it('does not exist behind a base path, where the root is the web app', () => {
    setEnv('HUBSPOT_OAUTH_CLIENT_ID', 'pca_hubspot');
    setEnv('NEXT_PUBLIC_BACKEND_URL', 'https://host.example/api');
    setEnv('NEXT_PUBLIC_OVERRIDE_BACKEND_URL', undefined);
    assert.equal(
      oauthAppIssuer({ dynamic: false, clientId: 'pca_hubspot' }),
      authorizationServerIssuer('/mcp-oauth-chatgpt')
    );
  });
});
