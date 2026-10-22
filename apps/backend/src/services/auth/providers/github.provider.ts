import {
  AuthProvider,
  AuthProviderAbstract,
} from '@gitroom/backend/services/auth/providers.interface';

@AuthProvider({ provider: 'GITHUB' })
export class GithubProvider extends AuthProviderAbstract {
  generateLink(query?: { state?: string }): string {
    return `https://github.com/login/oauth/authorize?client_id=${
      process.env.GITHUB_CLIENT_ID
    }&scope=user:email&state=${
      query?.state || 'login'
    }&redirect_uri=${encodeURIComponent(
      `${process.env.FRONTEND_URL}/settings`
    )}`;
  }

  async getToken(code: string, _redirectUri?: string): Promise<string> {
    const { access_token } = await (
      await fetch('https://github.com/login/oauth/access_token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          client_id: process.env.GITHUB_CLIENT_ID,
          client_secret: process.env.GITHUB_CLIENT_SECRET,
          code,
          redirect_uri: `${process.env.FRONTEND_URL}/settings`,
        }),
      })
    ).json();

    return access_token;
  }

  async getUser(access_token: string): Promise<{ email: string; id: string }> {
    const data = await (
      await fetch('https://api.github.com/user', {
        headers: {
          Authorization: `token ${access_token}`,
        },
      })
    ).json();

    // Every address on the account is listed, unverified ones included, in no
    // documented order. Only the verified primary one proves the inbox.
    const emails = await (
      await fetch('https://api.github.com/user/emails', {
        headers: {
          Authorization: `token ${access_token}`,
        },
      })
    ).json();

    const primary = emails.find(
      (e: { primary: boolean; verified: boolean }) => e.primary && e.verified
    );
    if (!primary) {
      throw new Error(
        'Your GitHub account has no verified primary email, please verify it on GitHub and try again'
      );
    }

    return {
      email: primary.email,
      id: String(data.id),
    };
  }
}
