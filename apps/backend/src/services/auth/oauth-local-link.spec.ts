import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  existingAccountForEmail,
  findExistingOauthUser,
  shouldAttachGoogleId,
  shouldBlockLocalRegister,
  shouldLinkGoogleToLocalEmail,
  type OauthUserStore,
} from './oauth-local-link.ts';

const localUser = (overrides: Record<string, unknown> = {}) => ({
  id: 'local-1',
  email: 'gokhan@example.com',
  providerName: 'LOCAL',
  providerId: '',
  activated: true,
  password: 'hashed',
  deletedAt: null,
  ...overrides,
});

describe('shouldLinkGoogleToLocalEmail', () => {
  it('links only Google when an email is present', () => {
    assert.equal(shouldLinkGoogleToLocalEmail('GOOGLE', 'a@b.com'), true);
    assert.equal(shouldLinkGoogleToLocalEmail('GOOGLE', ''), false);
    assert.equal(shouldLinkGoogleToLocalEmail('GOOGLE', null), false);
    assert.equal(shouldLinkGoogleToLocalEmail('GITHUB', 'a@b.com'), false);
    assert.equal(shouldLinkGoogleToLocalEmail('LOCAL', 'a@b.com'), false);
  });
});

describe('shouldAttachGoogleId', () => {
  it('attaches when empty or already the same id', () => {
    assert.equal(shouldAttachGoogleId('', 'gid'), true);
    assert.equal(shouldAttachGoogleId(null, 'gid'), true);
    assert.equal(shouldAttachGoogleId('gid', 'gid'), true);
    assert.equal(shouldAttachGoogleId('other', 'gid'), false);
  });
});

describe('existingAccountForEmail / shouldBlockLocalRegister', () => {
  const googleOnly = {
    id: 'google-user',
    providerName: 'GOOGLE',
    activated: true,
  };

  it('OTP prefers LOCAL when both exist, and never creates a second user', () => {
    const local = localUser();
    assert.equal(existingAccountForEmail(local, googleOnly), local);
  });

  it('OTP when only GOOGLE user exists → that user, no new LOCAL', () => {
    assert.equal(existingAccountForEmail(null, googleOnly), googleOnly);
    assert.equal(existingAccountForEmail(null, null), null);
  });

  it('password register when GOOGLE user exists → Email already exists', () => {
    assert.equal(shouldBlockLocalRegister(googleOnly), true);
    assert.equal(shouldBlockLocalRegister(null), false);
  });
});

describe('findExistingOauthUser', () => {
  const identity = { id: 'google-99', email: 'Gokhan@example.com' };

  it('email then Google: LOCAL wins, providerId set, providerName stays LOCAL', async () => {
    const local = localUser();
    const attached: string[] = [];
    const users: OauthUserStore = {
      getUserByProvider: async () => {
        throw new Error('must not need provider lookup when LOCAL email hits');
      },
      getUserByEmail: async (email) => {
        assert.equal(email, identity.email);
        return local;
      },
      attachProviderId: async (userId, providerId) => {
        attached.push(`${userId}:${providerId}`);
      },
      activateUser: async () => {
        throw new Error('already activated');
      },
    };

    const found = await findExistingOauthUser('GOOGLE', identity, users);
    assert.equal(found, local);
    assert.equal(found?.providerId, 'google-99');
    assert.deepEqual(attached, ['local-1:google-99']);
    assert.equal((found as { providerName: string }).providerName, 'LOCAL');
  });

  it('Google then Google: existing GOOGLE row is returned, no second org', async () => {
    const googleUser = {
      id: 'google-user',
      activated: true,
      providerName: 'GOOGLE',
      providerId: 'google-99',
    };
    const users: OauthUserStore<typeof googleUser> = {
      getUserByProvider: async () => googleUser,
      getUserByEmail: async () => null,
      attachProviderId: async () => {
        throw new Error('must not attach');
      },
      activateUser: async () => {
        throw new Error('must not activate');
      },
    };

    const found = await findExistingOauthUser('GOOGLE', identity, users);
    assert.equal(found, googleUser);
  });

  it('Google then Google after a prior link: LOCAL that already holds the Google id, no second org', async () => {
    const linkedLocal = localUser({ providerId: 'google-99' });
    const users: OauthUserStore = {
      getUserByProvider: async () => linkedLocal,
      getUserByEmail: async () => null,
      attachProviderId: async () => {
        throw new Error('already attached');
      },
      activateUser: async () => {
        throw new Error('must not activate');
      },
    };

    const found = await findExistingOauthUser('GOOGLE', identity, users);
    assert.equal(found, linkedLocal);
    assert.equal((found as { providerName: string }).providerName, 'LOCAL');
  });

  it('GOOGLE duplicate already exists + LOCAL same email: LOCAL wins', async () => {
    const local = localUser();
    const googleDup = {
      id: 'google-dup',
      activated: true,
      providerName: 'GOOGLE',
      providerId: 'google-99',
    };
    const attached: string[] = [];
    const users: OauthUserStore = {
      getUserByProvider: async () => googleDup,
      getUserByEmail: async () => local,
      attachProviderId: async (userId, providerId) => {
        attached.push(`${userId}:${providerId}`);
      },
      activateUser: async () => undefined,
    };

    const found = await findExistingOauthUser('GOOGLE', identity, users);
    assert.equal(found, local);
    assert.notEqual(found, googleDup);
    assert.equal(found?.providerId, 'google-99');
    assert.deepEqual(attached, ['local-1:google-99']);
  });

  it('activates an unactivated LOCAL user when Google proves the inbox', async () => {
    const local = localUser({ activated: false });
    let activated = false;
    const users: OauthUserStore = {
      getUserByProvider: async () => null,
      getUserByEmail: async () => local,
      attachProviderId: async () => undefined,
      activateUser: async (id) => {
        assert.equal(id, 'local-1');
        activated = true;
      },
    };

    const found = await findExistingOauthUser('GOOGLE', identity, users);
    assert.equal(activated, true);
    assert.equal(found?.activated, true);
  });

  it('does not overwrite a different attached Google id, still logs into LOCAL', async () => {
    const local = localUser({ providerId: 'other-google' });
    const users: OauthUserStore = {
      getUserByProvider: async () => {
        throw new Error('must not fall through to leftover GOOGLE');
      },
      getUserByEmail: async () => local,
      attachProviderId: async () => {
        throw new Error('must not overwrite');
      },
      activateUser: async () => undefined,
    };

    const found = await findExistingOauthUser('GOOGLE', identity, users);
    assert.equal(found, local);
    assert.equal(found?.providerId, 'other-google');
  });

  it('does not link GitHub to a LOCAL email', async () => {
    const users: OauthUserStore = {
      getUserByProvider: async () => null,
      getUserByEmail: async () => {
        throw new Error('must not look up LOCAL for GitHub');
      },
      attachProviderId: async () => undefined,
      activateUser: async () => undefined,
    };

    const found = await findExistingOauthUser('GITHUB', identity, users);
    assert.equal(found, null);
  });

  it('no LOCAL and no GOOGLE → null (caller registers)', async () => {
    const users: OauthUserStore = {
      getUserByProvider: async () => null,
      getUserByEmail: async () => null,
      attachProviderId: async () => {
        throw new Error('must not attach');
      },
      activateUser: async () => undefined,
    };

    const found = await findExistingOauthUser('GOOGLE', identity, users);
    assert.equal(found, null);
  });
});
