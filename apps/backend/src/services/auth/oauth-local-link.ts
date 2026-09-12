export type OauthIdentity = { id: string; email?: string | null };

export type LinkableUser = {
  id: string;
  activated: boolean;
  providerId?: string | null;
};

export type OauthUserStore<T extends LinkableUser = LinkableUser> = {
  getUserByProvider: (providerId: string, provider: string) => Promise<T | null>;
  getUserByEmail: (email: string) => Promise<T | null>;
  attachProviderId: (userId: string, providerId: string) => Promise<unknown>;
  activateUser: (userId: string) => Promise<unknown>;
};

// Google userinfo is a verified inbox. Password login keeps providerName LOCAL.
export const shouldLinkGoogleToLocalEmail = (
  provider: string,
  email?: string | null
) => provider === 'GOOGLE' && !!email;

export const shouldAttachGoogleId = (
  existingProviderId?: string | null,
  googleId?: string
) => !existingProviderId || existingProviderId === googleId;

// OTP / password-register: any existing row with this inbox is the account.
export const existingAccountForEmail = <T>(
  local: T | null,
  anyProvider: T | null
): T | null => local ?? anyProvider;

export const shouldBlockLocalRegister = (anyProvider: unknown) =>
  !!anyProvider;

export async function linkLocalGoogleAccount<T extends LinkableUser>(
  local: T,
  googleId: string,
  users: OauthUserStore<T>
): Promise<T> {
  if (shouldAttachGoogleId(local.providerId, googleId)) {
    await users.attachProviderId(local.id, googleId);
    local.providerId = googleId;
  }

  // Same as OTP: proving the inbox activates a LOCAL account waiting on email.
  if (!local.activated) {
    await users.activateUser(local.id);
    local.activated = true;
  }

  return local;
}

export async function findExistingOauthUser<T extends LinkableUser>(
  provider: string,
  identity: OauthIdentity,
  users: OauthUserStore<T>
): Promise<T | null> {
  // Email-first: a leftover GOOGLE row must not win over LOCAL with the same
  // inbox. That is the duplicate this product must not keep creating.
  if (shouldLinkGoogleToLocalEmail(provider, identity.email)) {
    const local = await users.getUserByEmail(identity.email!);
    if (local) {
      return linkLocalGoogleAccount(local, identity.id, users);
    }
  }

  return users.getUserByProvider(identity.id, provider);
}
