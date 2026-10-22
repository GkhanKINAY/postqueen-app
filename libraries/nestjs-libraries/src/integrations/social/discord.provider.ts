import {
  AuthTokenDetails,
  PostDetails,
  PostResponse,
  SocialProvider,
} from '@gitroom/nestjs-libraries/integrations/social/social.integrations.interface';
import { makeId } from '@gitroom/nestjs-libraries/services/make.is';
import { SocialAbstract } from '@gitroom/nestjs-libraries/integrations/social.abstract';
import { Integration } from '@gitroom/nestjs-libraries/database/prisma/generated/client';
import { DiscordDto } from '@gitroom/nestjs-libraries/dtos/posts/providers-settings/discord.dto';
import { Tool } from '@gitroom/nestjs-libraries/integrations/tool.decorator';
import FormDataUpload from 'form-data';

// A 50035 (Invalid Form Body) says what was wrong per field, nested under
// the field's path: { content: { _errors: [{ code, message }] } }.
const firstFormError = (errors: any): string | undefined => {
  if (!errors || typeof errors !== 'object') {
    return undefined;
  }
  if (Array.isArray(errors._errors) && errors._errors[0]?.message) {
    return errors._errors[0].message;
  }
  for (const value of Object.values(errors)) {
    const message = firstFormError(value);
    if (message) {
      return message;
    }
  }
  return undefined;
};

export class DiscordProvider extends SocialAbstract implements SocialProvider {
  override maxConcurrentJob = 5; // Discord has generous rate limits for webhook posting
  identifier = 'discord';
  category = 'chat' as const;
  name = 'Discord';
  isBetweenSteps = false;
  editor = 'markdown' as const;
  scopes = ['identify', 'guilds'];
  maxLength() {
    return 1980;
  }
  dto = DiscordDto;

  async refreshToken(refreshToken: string): Promise<AuthTokenDetails> {
    const { access_token, expires_in, refresh_token } = await (
      await this.fetch('https://discord.com/api/oauth2/token', {
        method: 'POST',
        body: new URLSearchParams({
          refresh_token: refreshToken,
          grant_type: 'refresh_token',
        }),
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Authorization: `Basic ${Buffer.from(
            process.env.DISCORD_CLIENT_ID +
              ':' +
              process.env.DISCORD_CLIENT_SECRET
          ).toString('base64')}`,
        },
      })
    ).json();

    const { application } = await (
      await this.fetch('https://discord.com/api/oauth2/@me', {
        headers: {
          Authorization: `Bearer ${access_token}`,
        },
      })
    ).json();

    return {
      refreshToken: refresh_token,
      expiresIn: expires_in,
      accessToken: access_token,
      id: '',
      name: application.name,
      picture: '',
      username: '',
    };
  }
  // Bot permissions asked for on install: View Channel (1 << 10), Send
  // Messages (1 << 11), Embed Links (1 << 14), Attach Files (1 << 15),
  // Change Nickname (1 << 26), Create Public / Private Threads (1 << 35,
  // 1 << 36) and Send Messages in Threads (1 << 38). View Channel, Embed Links
  // and Attach Files were missing, so a server whose roles did not already
  // grant them refused media and link previews; without Change Nickname,
  // renaming the bot (changeNickname) was refused the same way.
  // Only new installs (or a reconnect) see this; an existing install keeps
  // the permissions its server gave it.
  async generateAuthUrl() {
    const state = makeId(6);
    return {
      url: `https://discord.com/oauth2/authorize?client_id=${
        process.env.DISCORD_CLIENT_ID
      }&permissions=378024283136&response_type=code&redirect_uri=${encodeURIComponent(
        `${process.env.FRONTEND_URL}/integrations/social/discord`
      )}&integration_type=0&scope=bot+identify+guilds&state=${state}`,
      codeVerifier: makeId(10),
      state,
    };
  }

  async authenticate(params: {
    code: string;
    codeVerifier: string;
    refresh?: string;
  }) {
    const { access_token, expires_in, refresh_token, scope, guild } = await (
      await this.fetch('https://discord.com/api/oauth2/token', {
        method: 'POST',
        body: new URLSearchParams({
          code: params.code,
          grant_type: 'authorization_code',
          redirect_uri: `${process.env.FRONTEND_URL}/integrations/social/discord`,
        }),
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Authorization: `Basic ${Buffer.from(
            process.env.DISCORD_CLIENT_ID +
              ':' +
              process.env.DISCORD_CLIENT_SECRET
          ).toString('base64')}`,
        },
      })
    ).json();

    this.checkScopes(this.scopes, scope.split(' '));

    const { application } = await (
      await this.fetch('https://discord.com/api/oauth2/@me', {
        headers: {
          Authorization: `Bearer ${access_token}`,
        },
      })
    ).json();

    return {
      id: guild.id,
      name: application.name,
      accessToken: access_token,
      refreshToken: refresh_token,
      expiresIn: expires_in,
      picture: `https://cdn.discordapp.com/avatars/${application.bot.id}/${application.bot.avatar}.png`,
      username: application.bot.username,
    };
  }

  @Tool({ description: 'Channels', dataSchema: [] })
  async channels(accessToken: string, params: any, id: string) {
    const list = await (
      await this.fetch(`https://discord.com/api/guilds/${id}/channels`, {
        headers: {
          Authorization: `Bot ${process.env.DISCORD_BOT_TOKEN_ID}`,
        },
      })
    ).json();

    // Text (0) and announcement (5) channels. A forum (15) only takes new
    // threads, never a plain message, and posting uses Create Message, so
    // a forum picked here failed at publish time.
    return list
      .filter((p: any) => p.type === 0 || p.type === 5)
      .map((p: any) => ({
        id: String(p.id),
        name: p.name,
      }));
  }

  // Builds the multipart message and streams each attachment straight from its
  // source (size from a HEAD request) so files are never buffered in memory.
  // runStreamedUpload rebuilds the whole form per attempt (a consumed stream
  // can't be replayed) and keeps handleErrors classification.
  private async sendMessageWithMedia(
    channel: string,
    message: string,
    media: PostDetails['media']
  ) {
    return this.runStreamedUpload(async () => {
      const form = new FormDataUpload();
      form.append(
        'payload_json',
        JSON.stringify({
          content: message.replace(/\[\[\[(@.*?)]]]/g, (match, p1) => {
            return `<${p1}>`;
          }),
          attachments: media?.map((p, index) => ({
            id: index,
            description: `Picture ${index}`,
            filename: p.path.split('/').pop(),
          })),
        })
      );

      let index = 0;
      for (const item of media || []) {
        const fileSize = await this.mediaSize(item.path, this.identifier);
        const stream = await this.mediaStream(item.path, this.identifier);
        form.append(`files[${index}]`, stream, {
          filename: item.path.split('/').pop(),
          knownLength: fileSize,
        });
        index++;
      }

      const { data } = await this.getSsrfSafeAxios().post(
        `https://discord.com/api/channels/${channel}/messages`,
        form,
        {
          headers: {
            ...form.getHeaders(),
            Authorization: `Bot ${process.env.DISCORD_BOT_TOKEN_ID}`,
          },
        }
      );

      return data;
    }, this.identifier);
  }

  async post(
    id: string,
    accessToken: string,
    postDetails: PostDetails[]
  ): Promise<PostResponse[]> {
    const [firstPost] = postDetails;
    const channel = firstPost.settings.channel;

    const data = await this.sendMessageWithMedia(
      channel,
      firstPost.message,
      firstPost.media
    );

    return [
      {
        id: firstPost.id,
        releaseURL: `https://discord.com/channels/${id}/${channel}/${data.id}`,
        postId: data.id,
        status: 'success',
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
    const [commentPost] = postDetails;
    const channel = commentPost.settings.channel;

    // For Discord, we create a thread from the original message for comments
    // If we don't have a thread yet, create one. A thread started from a
    // message takes that message's id as its own, so every later comment
    // goes to the thread whose id is the post's; it used to fall back to the
    // channel and leave the thread after the first comment.
    let threadChannel = lastCommentId ? postId : channel;

    // Create thread if this is the first comment
    if (!lastCommentId) {
      const { id: threadId } = await (
        await this.fetch(
          `https://discord.com/api/channels/${channel}/messages/${postId}/threads`,
          {
            method: 'POST',
            headers: {
              Authorization: `Bot ${process.env.DISCORD_BOT_TOKEN_ID}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              name: 'Thread',
              auto_archive_duration: 1440,
            }),
          }
        )
      ).json();
      threadChannel = threadId;
    }

    const data = await this.sendMessageWithMedia(
      threadChannel,
      commentPost.message,
      commentPost.media
    );

    return [
      {
        id: commentPost.id,
        releaseURL: `https://discord.com/channels/${id}/${threadChannel}/${data.id}`,
        postId: data.id,
        status: 'success',
      },
    ];
  }

  async changeNickname(id: string, accessToken: string, name: string) {
    await (
      await this.fetch(`https://discord.com/api/guilds/${id}/members/@me`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bot ${process.env.DISCORD_BOT_TOKEN_ID}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          nick: name,
        }),
      })
    ).json();

    return {
      name,
    };
  }

  override async mention(
    token: string,
    data: { query: string },
    id: string,
    integration: Integration
  ) {
    const allRoles = await (
      await this.fetch(`https://discord.com/api/guilds/${id}/roles`, {
        headers: {
          Authorization: `Bot ${process.env.DISCORD_BOT_TOKEN_ID}`,
          'Content-Type': 'application/json',
        },
      })
    ).json();

    const matching = allRoles
      .filter((role: any) =>
        role.name.toLowerCase().includes(data.query.toLowerCase())
      )
      .filter((f: any) => f.name !== '@everyone' && f.name !== '@here');

    const list = await (
      await this.fetch(
        `https://discord.com/api/guilds/${id}/members/search?query=${data.query}`,
        {
          headers: {
            Authorization: `Bot ${process.env.DISCORD_BOT_TOKEN_ID}`,
            'Content-Type': 'application/json',
          },
        }
      )
    ).json();

    return [
      ...[
        {
          id: String('here'),
          label: 'here',
          image: '',
          doNotCache: true,
        },
        {
          id: String('everyone'),
          label: 'everyone',
          image: '',
          doNotCache: true,
        },
      ].filter((role: any) => {
        return role.label.toLowerCase().includes(data.query.toLowerCase());
      }),
      ...matching.map((p: any) => ({
        id: String('&' + p.id),
        label: p.name.split('@')[1],
        image: '',
        doNotCache: true,
      })),
      // Members belong to one server, and the mention cache is shared by every
      // workspace, so they are looked up fresh each time like the roles above.
      ...list.map((p: any) => ({
        id: String(p.user.id),
        label: p.user.global_name || p.user.username,
        image: `https://cdn.discordapp.com/avatars/${p.user.id}/${p.user.avatar}.png`,
        doNotCache: true,
      })),
    ];
  }

  mentionFormat(idOrHandle: string, name: string) {
    if (name === '@here' || name === '@everyone') {
      return name;
    }
    return `[[[@${idOrHandle.replace('@', '')}]]]`;
  }

  // Classified on Discord's JSON error code. Matching digits anywhere in the
  // body also matched ids, so a channel id holding "50013" read as a
  // permission error.
  override handleErrors(
    body: string
  ):
    | { type: 'refresh-token' | 'bad-body' | 'retry'; value: string }
    | undefined {
    let parsed: any = {};
    try {
      parsed = JSON.parse(body);
    } catch {
      return undefined;
    }

    switch (parsed?.code) {
      case 50001:
        return {
          type: 'bad-body',
          value:
            'The PostQueen bot cannot see this channel. Give it View Channel, or add it back to the server.',
        };
      case 50013:
        return {
          type: 'bad-body',
          value:
            'The PostQueen bot is missing a permission in this channel. Give it View Channel, Send Messages, Embed Links, Attach Files and Create Public Threads.',
        };
      case 10003:
        return {
          type: 'bad-body',
          value: 'This Discord channel no longer exists. Pick another channel.',
        };
      case 10008:
        return {
          type: 'bad-body',
          value:
            'The original Discord message was deleted, so the reply could not be posted.',
        };
      case 50008:
        return {
          type: 'bad-body',
          value: 'Discord cannot post in this kind of channel. Pick a text channel.',
        };
      case 40005:
        return {
          type: 'bad-body',
          value:
            'A file in this post is larger than this Discord server accepts. Use a smaller file.',
        };
      case 50035:
        return {
          type: 'bad-body',
          value: `Discord refused the post: ${
            firstFormError(parsed.errors) || parsed.message
          }`,
        };
      case 20028:
        return {
          type: 'retry',
          value:
            'Discord is limiting how fast PostQueen can post. Reschedule the post a few minutes later.',
        };
    }

    return undefined;
  }
}
