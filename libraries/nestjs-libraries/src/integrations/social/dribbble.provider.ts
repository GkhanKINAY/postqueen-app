import {
  AnalyticsData,
  AuthTokenDetails,
  PostDetails,
  PostResponse,
  SocialProvider,
} from '@gitroom/nestjs-libraries/integrations/social/social.integrations.interface';
import { makeId } from '@gitroom/nestjs-libraries/services/make.is';
import FormData from 'form-data';
import {
  SocialAbstract,
  stripQuery,
  ValidityMedia,
} from '@gitroom/nestjs-libraries/integrations/social.abstract';
import { DribbbleDto } from '@gitroom/nestjs-libraries/dtos/posts/providers-settings/dribbble.dto';
import mime from 'mime-types';
import { Tool } from '@gitroom/nestjs-libraries/integrations/tool.decorator';

export class DribbbleProvider extends SocialAbstract implements SocialProvider {
  override maxConcurrentJob = 3; // Dribbble has moderate API limits
  identifier = 'dribbble';
  category = 'business' as const;
  name = 'Dribbble';
  isBetweenSteps = false;
  scopes = ['public', 'upload'];
  editor = 'normal' as const;
  maxLength() {
    return 40000;
  }
  dto = DribbbleDto;

  override async checkValidity([firstItem]: Array<ValidityMedia[]>): Promise<
    string | true
  > {
    if (firstItem?.length !== 1) {
      return 'Dribbble needs exactly one image for a shot.';
    }
    const path = firstItem[0]?.path || '';
    // The type comes from the extension the path ends with. Looking for "mp4"
    // anywhere in it refused a picture whose name or folder held those letters
    // and let every other video format through. A path without an extension
    // is left to the size checks and to Dribbble.
    const type = mime.lookup(stripQuery(path));
    if (type && type.indexOf('video/') === 0) {
      return 'Dribbble does not accept videos. Attach one GIF, JPG or PNG image.';
    }
    if (type && !['image/gif', 'image/jpeg', 'image/png'].includes(type)) {
      return 'Dribbble does not accept this file type. Attach one GIF, JPG or PNG image.';
    }
    // A size that cannot be read is left for Dribbble to judge.
    if (
      path.indexOf('http') === 0 &&
      (await this.mediaSize(path, this.identifier).catch(() => 0)) >
        8 * 1024 * 1024
    ) {
      return 'Dribbble accepts images up to 8 MB.';
    }
    const details = await this.getImageDimensions(path);
    if (
      (details?.width === 400 && details?.height === 300) ||
      (details?.width === 800 && details?.height === 600)
    ) {
      return true;
    }
    return `Dribbble needs an image of exactly 400 x 300 or 800 x 600 pixels. This one is ${details?.width} x ${details?.height}.`;
  }

  override handleErrors(
    body: string,
    status: number
  ):
    | { type: 'refresh-token' | 'bad-body'; value: string }
    | undefined {
    // Dribbble tokens do not expire, so a 401 means it was revoked.
    if (status === 401) {
      return {
        type: 'refresh-token',
        value: 'Reconnect Dribbble in Channels, then schedule the post again.',
      };
    }

    // 429 and 500 are retried by the caller, which only retries a 500 that
    // has no mapping here.
    if (status < 400 || status === 429 || status >= 500) {
      return undefined;
    }

    // A 422 says only "Validation failed." in `message`, the reasons are in
    // `errors`: [{ "attribute": "image", "message": "..." }].
    let parsed: any;
    try {
      parsed = JSON.parse(body);
    } catch (err) {
      parsed = undefined;
    }
    const reasons = (Array.isArray(parsed?.errors) ? parsed.errors : [])
      .map((error: any) => String(error?.message || '').trim())
      .filter(Boolean)
      .join(' ');

    return {
      type: 'bad-body',
      value:
        reasons ||
        parsed?.message ||
        `Dribbble rejected the shot with status ${status}.`,
    };
  }

  /**
   * Dribbble access tokens do not expire and the OAuth exchange returns no
   * refresh token, so there is nothing to refresh: authenticate() stores an
   * empty refreshToken. Returning empty details is the same signal the other
   * non-refreshable providers give — refreshProcess() sees no accessToken and
   * puts the channel into the reconnect state, which is the right outcome when
   * a token really has been revoked on Dribbble's side.
   */
  async refreshToken(refreshToken: string): Promise<AuthTokenDetails> {
    return {
      refreshToken: '',
      expiresIn: 0,
      accessToken: '',
      id: '',
      name: '',
      picture: '',
      username: '',
    };
  }

  @Tool({ description: 'Teams list', dataSchema: [] })
  async teams(accessToken: string) {
    const { teams } = await (
      await this.fetch('https://api.dribbble.com/v2/user', {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      })
    ).json();

    return (
      teams?.map((team: any) => ({
        id: team.id,
        name: team.name,
      })) || []
    );
  }

  async generateAuthUrl() {
    const state = makeId(6);
    return {
      url: `https://dribbble.com/oauth/authorize?client_id=${
        process.env.DRIBBBLE_CLIENT_ID
      }&redirect_uri=${encodeURIComponent(
        `${process.env.FRONTEND_URL}/integrations/social/dribbble`
      )}&response_type=code&scope=${this.scopes.join('+')}&state=${state}`,
      codeVerifier: makeId(10),
      state,
    };
  }

  async authenticate(params: {
    code: string;
    codeVerifier: string;
    refresh: string;
  }) {
    const { access_token, scope } = await (
      await this.fetch(
        `https://dribbble.com/oauth/token?client_id=${process.env.DRIBBBLE_CLIENT_ID}&client_secret=${process.env.DRIBBBLE_CLIENT_SECRET}&code=${params.code}&redirect_uri=${process.env.FRONTEND_URL}/integrations/social/dribbble`,
        {
          method: 'POST',
        }
      )
    ).json();

    this.checkScopes(this.scopes, scope);

    const { id, name, avatar_url, login } = await (
      await this.fetch('https://api.dribbble.com/v2/user', {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${access_token}`,
        },
      })
    ).json();

    return {
      id: id,
      name,
      accessToken: access_token,
      refreshToken: '',
      expiresIn: 999999999,
      picture: avatar_url,
      username: login,
    };
  }

  async post(
    id: string,
    accessToken: string,
    postDetails: PostDetails<DribbbleDto>[]
  ): Promise<PostResponse[]> {
    const path = postDetails?.[0]?.media?.[0]?.path!;
    const slash = path.split('/').at(-1);

    // runStreamedUpload rebuilds the form per attempt (a consumed stream
    // can't be replayed) and classifies Dribbble's answer with handleErrors.
    // mediaStream fails with BadBody, not an error carrying a response, so a
    // refusal from the media host is never read as Dribbble's.
    const data2 = await this.runStreamedUpload(async () => {
      const formData = new FormData();
      formData.append('image', await this.mediaStream(path, this.identifier), {
        filename: slash,
        contentType: mime.lookup(slash!) || '',
        knownLength: await this.mediaSize(path, this.identifier),
      });

      formData.append('title', postDetails[0].settings.title);
      formData.append('description', postDetails[0].message);
      // Only a team id is sent: an empty choice, or a URL stored by an API
      // caller when the setting asked for one, is left out as it always was.
      const team = String(postDetails[0].settings.team ?? '');
      if (/^\d+$/.test(team)) {
        formData.append('team_id', team);
      }

      return this.getSsrfSafeAxios().post(
        'https://api.dribbble.com/v2/shots',
        formData,
        {
          headers: {
            ...formData.getHeaders(),
            Authorization: `Bearer ${accessToken}`,
          },
        }
      );
    }, this.identifier);

    // Dribbble answers 202 with the new shot's API URL in Location.
    const location: string | undefined = data2?.headers?.['location'];
    const newId = location?.split('/').at(-1) || '';

    return [
      {
        id: postDetails?.[0]?.id,
        status: 'completed',
        postId: newId,
        releaseURL: `https://dribbble.com/shots/${newId}`,
      },
    ];
  }

  analytics(
    id: string,
    accessToken: string,
    date: number
  ): Promise<AnalyticsData[]> {
    return Promise.resolve([]);
  }

  async postAnalytics(
    integrationId: string,
    accessToken: string,
    postId: string,
    date: number
  ): Promise<AnalyticsData[]> {
    // Dribbble doesn't provide detailed post-level analytics via their API
    return [];
  }
}
