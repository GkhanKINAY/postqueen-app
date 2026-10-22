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
import { Integration } from '@gitroom/nestjs-libraries/database/prisma/generated/client';
import { TwitchDto } from '@gitroom/nestjs-libraries/dtos/posts/providers-settings/twitch.dto';
import { timer } from '@gitroom/helpers/utils/timer';
import { isUUID } from 'class-validator';

export class TwitchProvider extends SocialAbstract implements SocialProvider {
  override maxConcurrentJob = 5; // Twitch limits are per user
  identifier = 'twitch';
  category = 'video' as const;
  name = 'Twitch';
  isBetweenSteps = false;
  editor = 'normal' as const;
  scopes = ['user:write:chat', 'user:read:chat', 'moderator:manage:announcements'];
  dto = TwitchDto;

  maxLength() {
    return 500; // Twitch chat message max length
  }

  async refreshToken(refreshToken: string): Promise<AuthTokenDetails> {
    const response = await this.fetch('https://id.twitch.tv/oauth2/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: process.env.TWITCH_CLIENT_ID!,
        client_secret: process.env.TWITCH_CLIENT_SECRET!,
        refresh_token: refreshToken,
      }),
    });

    const { access_token, refresh_token, expires_in } = await response.json();

    // Get user info
    const userInfo = await this.getUserInfo(access_token);

    return {
      refreshToken: refresh_token,
      expiresIn: expires_in,
      accessToken: access_token,
      id: userInfo.id,
      name: userInfo.name,
      picture: userInfo.picture || '',
      username: userInfo.username,
    };
  }

  async generateAuthUrl() {
    const state = makeId(32);

    const redirectUri = `${process.env.FRONTEND_URL}/integrations/social/twitch`;

    const url =
      `https://id.twitch.tv/oauth2/authorize` +
      `?response_type=code` +
      `&client_id=${process.env.TWITCH_CLIENT_ID}` +
      `&redirect_uri=${encodeURIComponent(redirectUri)}` +
      `&scope=${encodeURIComponent(this.scopes.join(' '))}` +
      `&state=${state}`;

    return {
      url,
      codeVerifier: makeId(10),
      state,
    };
  }

  async authenticate(params: {
    code: string;
    codeVerifier: string;
    refresh?: string;
  }) {
    const redirectUri = `${process.env.FRONTEND_URL}/integrations/social/twitch${
      params.refresh ? `?refresh=${params.refresh}` : ''
    }`;

    const tokenResponse = await this.fetch('https://id.twitch.tv/oauth2/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: process.env.TWITCH_CLIENT_ID!,
        client_secret: process.env.TWITCH_CLIENT_SECRET!,
        redirect_uri: redirectUri,
        code: params.code,
      }),
    });

    const { access_token, refresh_token, expires_in } =
      await tokenResponse.json();

    // Get user info
    const userInfo = await this.getUserInfo(access_token);

    return {
      id: userInfo.id,
      name: userInfo.name,
      accessToken: access_token,
      refreshToken: refresh_token,
      expiresIn: expires_in,
      picture: userInfo.picture || '',
      username: userInfo.username,
    };
  }

  private async getUserInfo(
    accessToken: string
  ): Promise<{ id: string; name: string; username: string; picture?: string }> {
    const userResponse = await fetch('https://api.twitch.tv/helix/users', {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Client-Id': process.env.TWITCH_CLIENT_ID!,
      },
    });

    const userData = await userResponse.json();
    const user = userData.data?.[0];

    return {
      id: String(user.id),
      name: user.display_name,
      username: user.login,
      picture: user.profile_image_url || '',
    };
  }

  private async sendAnnouncement(
    broadcasterId: string,
    accessToken: string,
    message: string,
    color: string = 'primary'
  ): Promise<{ success: boolean }> {
    // Announcements return 204 No Content on success, which this.fetch
    // reads as a failure, so the answer was never read at all and a refused
    // announcement was marked published. Anything else goes through
    // runStreamedUpload's classification like this.fetch.
    return this.runStreamedUpload(async () => {
      const response = await fetch(
        `https://api.twitch.tv/helix/chat/announcements?broadcaster_id=${broadcasterId}&moderator_id=${broadcasterId}`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Client-Id': process.env.TWITCH_CLIENT_ID!,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            message: message.substring(0, 500),
            color,
          }),
        }
      );

      if (response.status !== 204) {
        throw {
          response: {
            status: response.status,
            data: await response.text().catch(() => '{}'),
          },
        };
      }

      return { success: true };
    }, this.identifier);
  }

  private async sendChatMessage(
    broadcasterId: string,
    accessToken: string,
    message: string,
    replyToMessageId?: string
  ): Promise<{ messageId: string; isSent: boolean }> {
    const body: Record<string, string> = {
      broadcaster_id: broadcasterId,
      sender_id: broadcasterId,
      message: message.substring(0, 500),
    };

    if (replyToMessageId) {
      body.reply_parent_message_id = replyToMessageId;
    }

    const response = await this.fetch(
      'https://api.twitch.tv/helix/chat/messages',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Client-Id': process.env.TWITCH_CLIENT_ID!,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      }
    );

    const data = await response.json();

    // Twitch answers 200 for a message it dropped (AutoMod, a follower-only
    // chat, a duplicate), with is_sent false and the reason.
    if (data.data?.[0]?.is_sent === false) {
      const reason = data.data[0].drop_reason?.message;
      throw new BadBody(
        this.identifier,
        JSON.stringify(data),
        JSON.stringify(body),
        reason
          ? `Twitch did not send the message: ${reason}`
          : 'Twitch did not send the message.'
      );
    }

    return {
      messageId: data.data?.[0]?.message_id || makeId(10),
      isSent: data.data?.[0]?.is_sent ?? false,
    };
  }

  override handleErrors(
    body: string,
    status: number
  ):
    | { type: 'refresh-token' | 'bad-body' | 'disconnect'; value: string }
    | undefined {
    let message = '';
    try {
      message = String(JSON.parse(body)?.message || '');
    } catch {
      message = '';
    }

    // A token without a scope PostQueen now asks for: refreshing it keeps
    // the same scopes, so only a reconnect helps.
    if (status === 401 && /missing scope/i.test(message)) {
      return {
        type: 'disconnect',
        value:
          'PostQueen is missing a Twitch permission. Reconnect the channel and allow every permission.',
      };
    }

    // Retried first by this.fetch and runStreamedUpload; this is what is
    // left once those retries run out.
    if (status === 429) {
      return {
        type: 'bad-body',
        value:
          'Twitch is limiting how fast PostQueen can post. Reschedule the post a few minutes later.',
      };
    }

    if (status >= 400 && status < 500 && status !== 401) {
      return {
        type: 'bad-body',
        value: message
          ? `Twitch refused the post: ${message}`
          : 'Twitch refused the post.',
      };
    }

    return undefined;
  }

  async post(
    id: string,
    accessToken: string,
    postDetails: PostDetails[],
    integration: Integration
  ): Promise<PostResponse[]> {
    await timer(2000);
    const [firstPost] = postDetails;
    const messageType = firstPost.settings?.messageType || 'message';
    const announcementColor = firstPost.settings?.announcementColor || 'primary';

    if (messageType === 'announcement') {
      const result = await this.sendAnnouncement(
        id,
        accessToken,
        firstPost.message,
        announcementColor
      );

      return [
        {
          id: firstPost.id,
          postId: makeId(10), // Announcements don't return a message ID
          releaseURL: `https://twitch.tv/${integration.profile || integration.providerIdentifier}`,
          status: result.success ? 'posted' : 'error',
        },
      ];
    }

    // Regular chat message
    const result = await this.sendChatMessage(id, accessToken, firstPost.message);

    return [
      {
        id: firstPost.id,
        postId: result.messageId,
        releaseURL: `https://twitch.tv/${integration.profile || integration.providerIdentifier}`,
        status: result.isSent ? 'posted' : 'error',
      },
    ];
  }

  async comment(
    id: string,
    postId: string,
    lastCommentId: string | undefined,
    accessToken: string,
    postDetails: PostDetails[],
    integration: Integration
  ): Promise<PostResponse[]> {
    await timer(2000);
    const [commentPost] = postDetails;
    const messageType = commentPost.settings?.messageType || 'message';
    const announcementColor = commentPost.settings?.announcementColor || 'primary';

    if (messageType === 'announcement') {
      const result = await this.sendAnnouncement(
        id,
        accessToken,
        commentPost.message,
        announcementColor
      );

      return [
        {
          id: commentPost.id,
          postId: makeId(10),
          releaseURL: `https://twitch.tv/${integration.profile || integration.providerIdentifier}`,
          status: result.success ? 'posted' : 'error',
        },
      ];
    }

    // Regular chat message with reply. An announcement has no message id, so
    // its post keeps a made-up one that Twitch refuses as a reply parent;
    // Twitch's own ids are UUIDs, so only those are replied to.
    const parentId = lastCommentId || postId;
    const result = await this.sendChatMessage(
      id,
      accessToken,
      commentPost.message,
      isUUID(parentId) ? parentId : undefined
    );

    return [
      {
        id: commentPost.id,
        postId: result.messageId,
        releaseURL: `https://twitch.tv/${integration.profile || integration.providerIdentifier}`,
        status: result.isSent ? 'posted' : 'error',
      },
    ];
  }
}
