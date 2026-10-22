import {
  AuthTokenDetails,
  PostDetails,
  PostResponse,
  SocialProvider,
} from '@gitroom/nestjs-libraries/integrations/social/social.integrations.interface';
import { makeId } from '@gitroom/nestjs-libraries/services/make.is';
import {
  BadBody,
  SocialAbstract,
} from '@gitroom/nestjs-libraries/integrations/social.abstract';
import dayjs from 'dayjs';
import { Integration } from '@gitroom/nestjs-libraries/database/prisma/generated/client';
import { MoltbookDto } from '@gitroom/nestjs-libraries/dtos/posts/providers-settings/moltbook.dto';

const MOLTBOOK_API_BASE = 'https://www.moltbook.com/api/v1';

export class MoltbookProvider extends SocialAbstract implements SocialProvider {
  override maxConcurrentJob = 100; // Moltbook: 100 requests/minute
  identifier = 'moltbook';
  category = 'chat' as const;
  name = 'Moltbook';
  isBetweenSteps = false;
  scopes = [] as string[];
  isWeb3 = true;
  editor = 'normal' as const;
  dto = MoltbookDto;

  // The body takes 40,000 characters and the title 300 (moltbook.com/skill.md).
  // The post's text is the body; its start is the title.
  maxLength() {
    return 40000;
  }

  // Moltbook answers { success: false, error, hint }, and a cooldown (429)
  // with retry_after_minutes for a post or retry_after_seconds for a
  // comment.
  override handleErrors(
    body: string,
    status: number
  ): { type: 'refresh-token' | 'bad-body'; value: string } | undefined {
    let parsed: any = {};
    try {
      parsed = JSON.parse(body);
    } catch {
      parsed = {};
    }

    if (status === 401) {
      return {
        type: 'refresh-token',
        value:
          'Moltbook refused the API key. Reconnect the channel with a current key.',
      };
    }

    if (status === 429) {
      const minutes =
        parsed.retry_after_minutes ??
        (parsed.retry_after_seconds
          ? Math.ceil(parsed.retry_after_seconds / 60)
          : undefined);
      return {
        type: 'bad-body',
        value: minutes
          ? `Moltbook limits how often this agent can post. Schedule this one at least ${minutes} minute${
              minutes === 1 ? '' : 's'
            } later.`
          : 'Moltbook limits how often this agent can post. Schedule this one later.',
      };
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

  async generateAuthUrl() {
    const state = makeId(6);
    return {
      url: state,
      codeVerifier: makeId(10),
      state,
    };
  }

  async registerAgent(name: string, description: string) {
    const response = await this.getSsrfSafeAxios().post(
      `${MOLTBOOK_API_BASE}/agents/register`,
      { name, description },
      { headers: { 'Content-Type': 'application/json' } }
    );

    if (!response.data.success) {
      throw new Error(response.data.error || 'Registration failed');
    }

    return response.data.agent;
  }

  async checkAgentStatus(apiKey: string) {
    const response = await this.getSsrfSafeAxios().get(
      `${MOLTBOOK_API_BASE}/agents/status`,
      {
        headers: { Authorization: `Bearer ${apiKey}` },
      }
    );

    return response.data;
  }

  async getAgentProfile(apiKey: string) {
    const response = await this.getSsrfSafeAxios().get(
      `${MOLTBOOK_API_BASE}/agents/me`,
      {
        headers: { Authorization: `Bearer ${apiKey}` },
      }
    );

    if (!response.data.success) {
      throw new Error(response.data.error || 'Failed to get profile');
    }

    return response.data.agent;
  }

  async authenticate(params: {
    code: string;
    codeVerifier: string;
    refresh?: string;
  }) {
    const apiKey = params.code;

    const profile = await this.getAgentProfile(apiKey);

    return {
      id: profile.name || profile.id,
      name: profile.display_name || profile.name,
      accessToken: apiKey,
      refreshToken: '',
      expiresIn: dayjs().add(200, 'year').unix() - dayjs().unix(),
      picture: '',
      username: profile.name,
    };
  }

  async post(
    id: string,
    accessToken: string,
    postDetails: PostDetails[],
    integration: Integration
  ): Promise<PostResponse[]> {
    const results: PostResponse[] = [];

    for (const post of postDetails) {
      const postData: {
        submolt: string;
        title: string;
        content?: string;
        url?: string;
      } = {
        submolt: post.settings?.submolt || 'general',
        title: post.message.slice(0, 300),
        content: post.message,
      };

      // Axios errors go through handleErrors so a refusal is typed instead
      // of published again.
      const response = await this.runStreamedUpload(
        () =>
          this.getSsrfSafeAxios().post(`${MOLTBOOK_API_BASE}/posts`, postData, {
            headers: {
              Authorization: `Bearer ${accessToken}`,
              'Content-Type': 'application/json',
            },
          }),
        this.identifier
      );

      if (!response.data.success) {
        throw new BadBody(
          this.identifier,
          JSON.stringify(response.data),
          '{}',
          response.data.error || 'Moltbook did not create the post.'
        );
      }

      const postId = response.data.post.id;
      results.push({
        id: post.id,
        postId: String(postId),
        releaseURL: `https://www.moltbook.com/post/${postId}`,
        status: 'completed',
      });
    }

    return results;
  }

  async comment(
    id: string,
    postId: string,
    lastCommentId: string | undefined,
    accessToken: string,
    postDetails: PostDetails[],
    integration: Integration
  ): Promise<PostResponse[]> {
    const results: PostResponse[] = [];

    for (const post of postDetails) {
      const commentData: { content: string; parent_id?: string } = {
        content: post.message,
      };

      if (lastCommentId) {
        commentData.parent_id = lastCommentId;
      }

      const response = await this.runStreamedUpload(
        () =>
          this.getSsrfSafeAxios().post(
            `${MOLTBOOK_API_BASE}/posts/${postId}/comments`,
            commentData,
            {
              headers: {
                Authorization: `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
              },
            }
          ),
        this.identifier
      );

      if (!response.data.success) {
        throw new BadBody(
          this.identifier,
          JSON.stringify(response.data),
          '{}',
          response.data.error || 'Moltbook did not create the comment.'
        );
      }

      const commentId = response.data.comment.id;
      results.push({
        id: post.id,
        postId: String(commentId),
        releaseURL: `https://www.moltbook.com/post/${postId}`,
        status: 'completed',
      });
    }

    return results;
  }
}
