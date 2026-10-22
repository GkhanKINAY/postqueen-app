import {
  AuthTokenDetails,
  PostDetails,
  PostResponse,
  SocialProvider,
} from '@gitroom/nestjs-libraries/integrations/social/social.integrations.interface';
import {
  BadBody,
  SocialAbstract,
} from '@gitroom/nestjs-libraries/integrations/social.abstract';
import dayjs from 'dayjs';
import { Integration } from '@gitroom/nestjs-libraries/database/prisma/generated/client';
import { makeId } from '@gitroom/nestjs-libraries/services/make.is';
import { WordpressDto } from '@gitroom/nestjs-libraries/dtos/posts/providers-settings/wordpress.dto';
import slugify from 'slugify';
// import FormData from 'form-data';
import { Tool } from '@gitroom/nestjs-libraries/integrations/tool.decorator';
import { Rules } from '@gitroom/nestjs-libraries/chat/rules.description.decorator';
import { getSsrfSafeDispatcher } from '@gitroom/nestjs-libraries/dtos/webhooks/ssrf.safe.dispatcher';
import { string } from 'yup';
import mime from 'mime-types';

const WORDPRESS_USER_AGENT = 'PostQueen/1.0 (+https://postqueen.ai)';

// WordPress sites often print a PHP notice, or a plugin its own output, around
// the JSON (`<b>Notice</b>: ... on line 12<br />{"id":12,...}`), so the object
// is read from the first `{` to the last `}` instead of from the whole text.
// Undefined when there is still no object to read.
const readWordpressJson = (text: string): any => {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end < start) {
    return undefined;
  }
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch (err) {
    return undefined;
  }
};

@Rules(
  'WordPress publishes the content as an article: pictures go inside the content as <img src="..."> where they should appear, the src must be a picture from the media library (upload it with uploadFromUrlTool first), attachments are not published, the cover picture is the main_image setting'
)
export class WordpressProvider
  extends SocialAbstract
  implements SocialProvider
{
  identifier = 'wordpress';
  category = 'publishing' as const;
  name = 'WordPress';
  isBetweenSteps = false;
  editor = 'html' as const;
  scopes = [] as string[];
  override maxConcurrentJob = 8; // WordPress sites are the customer's own servers
  dto = WordpressDto;
  maxLength() {
    return 100000;
  }

  inlineImages() {
    return true;
  }

  async generateAuthUrl() {
    const state = makeId(6);
    return {
      url: state,
      codeVerifier: makeId(10),
      state,
    };
  }

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
  override handleErrors(
    body: string,
    status: number
  ):
    | { type: 'refresh-token' | 'bad-body' | 'retry'; value: string }
    | undefined {
    // rest_cannot_create, rest_cannot_publish and the rest of the family, for
    // posts and media alike. A 401 is WordPress answering a visitor that is not
    // logged in, which with an Application Password means the header never
    // reached it. Both are bad-body: a reconnect would send the same header.
    const { code, message } = readWordpressJson(body) || {};
    if (String(code || '').indexOf('rest_cannot_') !== 0) {
      return undefined;
    }

    if (status === 401) {
      return {
        type: 'bad-body',
        value:
          'WordPress did not see the login. A security plugin or server setting may be removing the Authorization header.',
      };
    }

    let reason = String(message || '').trim();
    if (reason && !/[.!?]$/.test(reason)) {
      reason = `${reason}.`;
    }
    return {
      type: 'bad-body',
      value: `${
        reason ? `WordPress refused: ${reason}` : 'WordPress refused the post.'
      } Check that the connected user has the Author or Editor role.`,
    };
  }

  async customFields() {
    return [
      {
        key: 'domain',
        label: 'Domain URL',
        validation: `/^https?:\\/\\/(?:www\\.)?[\\w\\-]+(\\.[\\w\\-]+)+([\\/?#][^\\s]*)?$/`,
        type: 'text' as const,
      },
      {
        key: 'username',
        label: 'Username',
        validation: `/.+/`,
        type: 'text' as const,
      },
      {
        key: 'password',
        label: 'Password',
        validation: `/.+/`,
        type: 'password' as const,
        hint: 'Application password, create in User->Profile',
      },
    ];
  }

  async authenticate(params: {
    code: string;
    codeVerifier: string;
    refresh?: string;
  }) {
    const body = JSON.parse(Buffer.from(params.code, 'base64').toString()) as {
      domain: string;
      username: string;
      password: string;
    };

    // Normalize the domain - users often paste it with surrounding whitespace
    // or a trailing slash, which would otherwise build `https://site.com//wp-json/...`.
    // A loop rather than /\/+$/: that pattern backtracks quadratically on a
    // long run of slashes that is not at the end.
    let domain = body.domain.trim();
    while (domain.endsWith('/')) {
      domain = domain.slice(0, -1);
    }

    const auth = Buffer.from(`${body.username}:${body.password}`).toString(
      'base64'
    );

    // Direct fetch (not `this.fetch`) so we can branch on the HTTP status and
    // return a specific message instead of throwing a generic error.
    let response: Response;
    try {
      response = await fetch(`${domain}/wp-json/wp/v2/users/me`, {
        headers: {
          Authorization: `Basic ${auth}`,
          'User-Agent': WORDPRESS_USER_AGENT,
        },
        // @ts-ignore - undici-only option; blocks SSRF to internal IPs
        dispatcher: getSsrfSafeDispatcher(),
      });
    } catch (err) {
      // DNS failure, connection refused, TLS error, site unreachable, etc.
      console.log(err);
      return 'Could not reach your WordPress site. Check the Domain URL and that the site is publicly accessible.';
    }

    // A security plugin (e.g. Wordfence), a WAF, or the server config commonly
    // strips the Authorization header or locks down the REST API. We don't try
    // to work around that - surface a distinct, actionable message instead.
    if (!response.ok) {
      // Log what WordPress actually returned (REST errors carry a `code` and
      // `message`) so failures can be diagnosed without guessing.
      const errorBody = await response.text().catch(() => '');
      let wpCode = '';
      let wpMessage = '';
      try {
        const parsed = JSON.parse(errorBody);
        wpCode = parsed?.code || '';
        wpMessage = parsed?.message || '';
      } catch (err) {
        // Non-JSON error body (e.g. an HTML page from a security plugin).
      }
      // The domain goes in as an argument, not into the format string, where a
      // `%s` in it would be read as a directive.
      console.log(
        'WordPress auth failed for %s (HTTP %d)',
        domain,
        response.status,
        JSON.stringify({
          code: wpCode,
          message: wpMessage,
          ...(wpCode ? {} : { body: errorBody.slice(0, 500) }),
        })
      );

      if (response.status === 401 || response.status === 403) {
        return 'WordPress rejected the login. A security plugin or server setting may be blocking the REST API or stripping the Authorization header, or the username / Application Password is incorrect.';
      }

      return `WordPress returned an unexpected error (HTTP ${response.status}). Make sure the REST API is enabled and Application Passwords are available.`;
    }

    // Even on a 200, a security plugin / maintenance page can return HTML
    // instead of JSON, which would otherwise throw on `.json()`.
    let data: any;
    try {
      data = await response.json();
    } catch (err) {
      console.log(err);
      return 'WordPress did not return a valid response. The REST API may be disabled or blocked by a security plugin.';
    }

    const { id, name, avatar_urls, code } = data || {};

    if (code) {
      return 'Invalid credentials';
    }

    const biggestImage = Object.entries(avatar_urls || {}).reduce(
      (all, current) => {
        if (all > Number(current[0])) {
          return all;
        }
        return Number(current[0]);
      },
      0
    );

    return {
      refreshToken: '',
      expiresIn: dayjs().add(100, 'years').unix() - dayjs().unix(),
      accessToken: params.code,
      id: body.domain + '_' + id,
      name,
      picture: avatar_urls?.[String(biggestImage)] || '',
      username: body.username,
    };
  }

  // Custom provider functions below are invoked from the backend HTTP endpoint
  // (`/integrations/function`) - which is NOT a Temporal activity - so they must
  // use a plain `fetch` (with the SSRF guard) rather than `this.fetch`, which
  // calls `Context.current()` and throws outside an activity. This mirrors how
  // `authenticate` issues its request.
  private async wpGet(token: string, path: string) {
    const body = JSON.parse(Buffer.from(token, 'base64').toString()) as {
      domain: string;
      username: string;
      password: string;
    };

    const auth = Buffer.from(`${body.username}:${body.password}`).toString(
      'base64'
    );

    const response = await fetch(`${body.domain}${path}`, {
      headers: {
        Authorization: `Basic ${auth}`,
        'User-Agent': WORDPRESS_USER_AGENT,
      },
      // @ts-ignore - undici-only option; blocks SSRF to internal IPs
      dispatcher: getSsrfSafeDispatcher(),
    });

    return response.json();
  }

  @Tool({
    description: 'Get list of post types',
    dataSchema: [],
  })
  async postTypes(token: string) {
    const postTypes = await this.wpGet(token, '/wp-json/wp/v2/types');

    return Object.entries<any>(postTypes).reduce((all, [key, value]) => {
      if (
        key.indexOf('wp_') > -1 ||
        key.indexOf('nav_') > -1 ||
        key === 'attachment'
      ) {
        return all;
      }

      all.push({
        id: value.rest_base,
        name: value.name,
      });

      return all;
    }, []);
  }

  @Tool({
    description: 'Get list of categories',
    dataSchema: [],
  })
  async categoriesList(token: string) {
    const categories = await this.wpGet(
      token,
      '/wp-json/wp/v2/categories?per_page=100'
    );

    return (Array.isArray(categories) ? categories : []).map(
      (category: any) => ({
        id: category.id,
        name: category.name,
      })
    );
  }

  @Tool({
    description: 'Get list of tags',
    dataSchema: [],
  })
  async tagsList(token: string) {
    const tags = await this.wpGet(token, '/wp-json/wp/v2/tags?per_page=100');

    return (Array.isArray(tags) ? tags : []).map((tag: any) => ({
      id: tag.id,
      name: tag.name,
    }));
  }

  async post(
    id: string,
    accessToken: string,
    postDetails: PostDetails<WordpressDto>[],
    integration: Integration
  ): Promise<PostResponse[]> {
    const body = JSON.parse(Buffer.from(accessToken, 'base64').toString()) as {
      domain: string;
      username: string;
      password: string;
    };

    const auth = Buffer.from(`${body.username}:${body.password}`).toString(
      'base64'
    );

    let mediaId = '';
    if (postDetails?.[0]?.settings?.main_image?.path) {
      console.log(
        'Uploading image to WordPress',
        postDetails[0].settings.main_image.path
      );

      // Read with readOrFetch rather than this.fetch: a 401 from the media
      // host would otherwise be classified as WordPress asking for a reconnect.
      const fileName = postDetails[0].settings.main_image.path.split('/').pop();
      const image = await this.readOrFetch(
        postDetails[0].settings.main_image.path
      );

      const mediaText = await (
        await this.fetch(`${body.domain}/wp-json/wp/v2/media`, {
          method: 'POST',
          headers: {
            Authorization: `Basic ${auth}`,
            'Content-Disposition': `attachment; filename="${fileName}"`,
            'Content-Type':
              mime.lookup((fileName || '').split('?')[0]) ||
              'application/octet-stream',
            'User-Agent': WORDPRESS_USER_AGENT,
          },
          body: new Uint8Array(image),
        })
      )
        .text()
        .catch(() => '');

      const mediaResponse = readWordpressJson(mediaText);
      if (!mediaResponse?.id) {
        throw new BadBody(
          this.identifier,
          mediaText,
          '{}',
          'WordPress did not confirm the cover image upload, so the post was not published. Check the media library on your site, then try again.'
        );
      }

      mediaId = mediaResponse.id;
    }

    const categories = (postDetails?.[0]?.settings?.categories || [])
      .map((category) => Number(category))
      .filter((category) => !isNaN(category));
    const tags = (postDetails?.[0]?.settings?.tags || [])
      .map((tag) => Number(tag))
      .filter((tag) => !isNaN(tag));

    const submitText = await (
      await this.fetch(
        `${body.domain}/wp-json/wp/v2/${postDetails?.[0]?.settings?.type}`,
        {
          headers: {
            Authorization: `Basic ${auth}`,
            'Content-Type': 'application/json',
            'User-Agent': WORDPRESS_USER_AGENT,
          },
          method: 'POST',
          body: JSON.stringify({
            title: postDetails?.[0]?.settings?.title,
            content: postDetails?.[0]?.message,
            slug: slugify(postDetails?.[0]?.settings?.title, {
              lower: true,
              strict: true,
              trim: true,
            }),
            status: postDetails?.[0]?.settings?.status || 'publish',
            ...(categories.length ? { categories } : {}),
            ...(tags.length ? { tags } : {}),
            ...(mediaId ? { featured_media: mediaId } : {}),
          }),
        }
      )
    )
      .text()
      .catch(() => '');

    // WordPress has created the post once it answers 200/201. A plain error
    // here would be retried by the post workflow and publish it again, so an
    // answer that still cannot be read fails as BadBody, which is never
    // retried.
    const submit = readWordpressJson(submitText);
    if (!submit?.id) {
      throw new BadBody(
        this.identifier,
        submitText,
        '{}',
        'WordPress may have published the post, but its answer could not be read. Check your site before posting again.'
      );
    }

    return [
      {
        id: postDetails?.[0].id,
        status: 'completed',
        postId: String(submit.id),
        releaseURL: submit.link,
      },
    ];
  }
}
