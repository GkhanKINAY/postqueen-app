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

// Google userinfo is a verified inbox. A later lookup by that Google id must
// still find the LOCAL row (password login keeps providerName LOCAL).
export const shouldLinkGoogleToLocalEmail = (
  provider: string,
  email?: string | null
) => provider === 'GOOGLE' && !!email;

export const shouldAttachGoogleId = (
  existingProviderId?: string | null,
  googleId?: string
) => !existingProviderId || existingProviderId === googleId;

export async function findExistingOauthUser<T extends LinkableUser>(
  provider: string,
  identity: OauthIdentity,
  users: OauthUserStore<T>
): Promise<T | null> {
  const byProvider = await users.getUserByProvider(identity.id, provider);
  if (byProvider) {
    return byProvider;
  }

  if (!shouldLinkGoogleToLocalEmail(provider, identity.email)) {
    return null;
  }

  const local = await users.getUserByEmail(identity.email!);
  if (!local) {
    return null;
  }

  if (shouldAttachGoogleId(local.providerId, identity.id)) {
    await users.attachProviderId(local.id, identity.id);
    local.providerId = identity.id;
  }

  // Same as OTP: proving the inbox activates a LOCAL account waiting on email.
  if (!local.activated) {
    await users.activateUser(local.id);
    local.activated = true;
  }

  return local;
}
