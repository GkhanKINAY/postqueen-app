import {
  AuthTokenDetails,
  PostDetails,
  PostResponse,
  SocialProvider,
} from '@gitroom/nestjs-libraries/integrations/social/social.integrations.interface';
import {
  BadBody,
  RefreshToken,
  SocialAbstract,
} from '@gitroom/nestjs-libraries/integrations/social.abstract';
import { tags } from '@gitroom/nestjs-libraries/integrations/social/hashnode.tags';
import { jsonToGraphQLQuery } from 'json-to-graphql-query';
import { HashnodeSettingsDto } from '@gitroom/nestjs-libraries/dtos/posts/providers-settings/hashnode.settings.dto';
import dayjs from 'dayjs';
import { Integration } from '@gitroom/nestjs-libraries/database/prisma/generated/client';
import { makeId } from '@gitroom/nestjs-libraries/services/make.is';
import { Tool } from '@gitroom/nestjs-libraries/integrations/tool.decorator';

// gql.hashnode.com now answers every request with a 301 to Hashnode's
// announcement page, so the JSON parse failed and every connect read as a bad
// token. gql-beta is the endpoint Hashnode's own API reference names
// (github.com/Hashnode/gql-skill).
const HASHNODE_API_URL = 'https://gql-beta.hashnode.com';

// Hashnode reports a rejected token or a publication without the Pro plan the
// API has required since 2026-05-13 as HTTP 200 with an `errors` array, so the
// status alone cannot tell them apart. `extensions.code` can: UNAUTHENTICATED
// for the token, FORBIDDEN (with Hashnode's own upgrade message) for the plan.
type HashnodeError = { message?: string; extensions?: { code?: string } };

export class HashnodeProvider extends SocialAbstract implements SocialProvider {
  override maxConcurrentJob = 3; // Hashnode has lenient publishing limits
  identifier = 'hashnode';
  category = 'publishing' as const;
  name = 'Hashnode';
  isBetweenSteps = false;
  scopes = [] as string[];
  editor = 'markdown' as const;
  maxLength() {
    return 10000;
  }
  dto = HashnodeSettingsDto;

  async generateAuthUrl() {
    const state = makeId(6);
    return {
      url: state,
      codeVerifier: makeId(10),
      state,
    };
  }

  // A query or input the schema no longer accepts comes back as HTTP 400 with
  // the reason in `errors`; without this the post failed as "Unknown Error".
  // Server errors are left out so a 500 is still retried.
  override handleErrors(body: string) {
    try {
      const error: HashnodeError | undefined = JSON.parse(body)?.errors?.[0];
      if (
        error?.message &&
        [
          'GRAPHQL_VALIDATION_FAILED',
          'GRAPHQL_PARSE_FAILED',
          'BAD_USER_INPUT',
        ].includes(error.extensions?.code || '')
      ) {
        return { type: 'bad-body' as const, value: error.message };
      }
    } catch (err) {
      // Not JSON: the default handling applies.
    }

    return undefined;
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

  async customFields() {
    return [
      {
        key: 'apiKey',
        label: 'API key',
        validation: `/^.{3,}$/`,
        type: 'password' as const,
      },
    ];
  }

  async authenticate(params: {
    code: string;
    codeVerifier: string;
    refresh?: string;
  }) {
    const body = JSON.parse(Buffer.from(params.code, 'base64').toString());
    let json: {
      data?: {
        me?: {
          name: string;
          id: string;
          profilePicture?: string;
          username: string;
        } | null;
      };
      errors?: HashnodeError[];
    };
    try {
      json = await (
        await fetch(HASHNODE_API_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `${body.apiKey}`,
          },
          body: JSON.stringify({
            query: `
                    query {
                      me {
                        name,
                        id,
                        profilePicture
                        username
                      }
                    }
                `,
          }),
        })
      ).json();
    } catch (err) {
      // A network failure, or a page where JSON should be (the endpoint moved
      // again, or Hashnode is down). Nothing here says the token is wrong.
      console.log(err);
      return 'Could not reach the Hashnode API. Please try again later.';
    }

    const me = json?.data?.me;
    if (!me?.id) {
      const error = json?.errors?.[0];
      if (!error || error.extensions?.code === 'UNAUTHENTICATED') {
        return 'Invalid credentials';
      }

      if (error.extensions?.code === 'FORBIDDEN') {
        return (
          error.message ||
          'Hashnode API access requires a Pro plan on your publication.'
        );
      }

      console.log('Hashnode connect failed', JSON.stringify(json.errors));
      return `Hashnode returned an unexpected error${
        error.message ? `: ${error.message}` : ''
      }`;
    }

    return {
      refreshToken: '',
      expiresIn: dayjs().add(100, 'years').unix() - dayjs().unix(),
      accessToken: body.apiKey,
      id: me.id,
      name: me.name,
      picture: me.profilePicture || '',
      username: me.username,
    };
  }

  async tags() {
    return tags.map((tag) => ({ value: tag.objectID, label: tag.name }));
  }

  @Tool({ description: 'Tags', dataSchema: [] })
  tagsList() {
    return tags;
  }

  @Tool({ description: 'Publications', dataSchema: [] })
  async publications(accessToken: string) {
    const {
      data: {
        me: {
          publications: { edges },
        },
      },
    } = await (
      await fetch(HASHNODE_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `${accessToken}`,
        },
        body: JSON.stringify({
          query: `
            query {
              me {
                publications (first: 50) {
                  edges{
                    node {
                      id
                      title
                    }
                  }
                }
              }
            }
                `,
        }),
      })
    ).json();

    return edges.map(
      ({ node: { id, title } }: { node: { id: string; title: string } }) => ({
        id,
        name: title,
      })
    );
  }

  async post(
    id: string,
    accessToken: string,
    postDetails: PostDetails[],
    integration: Integration
  ): Promise<PostResponse[]> {
    const { settings } = postDetails?.[0] || { settings: {} };
    const query = jsonToGraphQLQuery(
      {
        mutation: {
          publishPost: {
            __args: {
              input: {
                title: settings.title,
                publicationId: settings.publication,
                ...(settings.canonical
                  ? { originalArticleURL: settings.canonical }
                  : {}),
                contentMarkdown: postDetails?.[0].message,
                tags: settings.tags.map(
                  (tag: { value: string; label: string }) => {
                    // Saved settings hold the tag's objectID; the API takes
                    // `{ slug, name }` now and rejects `{ id }`. A slug passed
                    // as the value (the MCP tool lists both) is kept as is.
                    const known = tags.find(
                      (p) => p.objectID === tag.value || p.slug === tag.value
                    );
                    return {
                      slug: known?.slug || tag.value,
                      name: known?.name || tag.label,
                    };
                  }
                ),
                ...(settings.subtitle ? { subtitle: settings.subtitle } : {}),
                ...(settings.main_image
                  ? {
                      coverImage: `${
                        settings?.main_image?.path?.indexOf('http') === -1
                          ? `${process.env.NEXT_PUBLIC_BACKEND_URL}/${process.env.NEXT_PUBLIC_UPLOAD_STATIC_DIRECTORY || 'uploads'}`
                          : ``
                      }${settings?.main_image?.path}`,
                    }
                  : {}),
              },
            },
            post: {
              id: true,
              url: true,
            },
          },
        },
      },
      { pretty: true }
    );

    const {
      data,
      errors,
    }: {
      data?: { publishPost?: { post?: { id: string; url: string } } } | null;
      errors?: HashnodeError[];
    } = await (
      await this.fetch(HASHNODE_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `${accessToken}`,
        },
        body: JSON.stringify({
          query,
        }),
      })
    ).json();

    const published = data?.publishPost?.post;
    if (!published) {
      const error = errors?.[0];
      if (error?.extensions?.code === 'UNAUTHENTICATED') {
        throw new RefreshToken(
          this.identifier,
          JSON.stringify(errors),
          query,
          error.message
        );
      }

      throw new BadBody(
        this.identifier,
        JSON.stringify(errors || {}),
        query,
        error?.message || 'Hashnode did not publish the post'
      );
    }

    const { id: postId, url } = published;

    return [
      {
        id: postDetails?.[0].id,
        status: 'completed',
        postId: postId,
        releaseURL: url,
      },
    ];
  }
}
