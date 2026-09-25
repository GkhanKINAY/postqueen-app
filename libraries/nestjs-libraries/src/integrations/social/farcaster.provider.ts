import {
  AuthTokenDetails,
  PostDetails,
  PostResponse,
  SocialProvider,
} from '@gitroom/nestjs-libraries/integrations/social/social.integrations.interface';
import { makeId } from '@gitroom/nestjs-libraries/services/make.is';
import dayjs from 'dayjs';
import {
  SocialAbstract,
  ValidityMedia,
} from '@gitroom/nestjs-libraries/integrations/social.abstract';
import { NeynarAPIClient } from '@neynar/nodejs-sdk';
import { Integration } from '@gitroom/nestjs-libraries/database/prisma/generated/client';
import { FarcasterDto } from '@gitroom/nestjs-libraries/dtos/posts/providers-settings/farcaster.dto';
import { Tool } from '@gitroom/nestjs-libraries/integrations/tool.decorator';
import { Rules } from '@gitroom/nestjs-libraries/chat/rules.description.decorator';
import { mnemonicToAccount } from 'viem/accounts';
import { toDataURL } from 'qrcode';

const client = new NeynarAPIClient({
  apiKey: process.env.NEYNAR_SECRET_KEY || '00000000-000-0000-000-000000000000',
});

const SIGNED_KEY_REQUEST_VALIDATOR_EIP_712_DOMAIN = {
  name: 'Farcaster SignedKeyRequestValidator',
  version: '1',
  chainId: 10,
  verifyingContract: '0x00000000fc700472606ed4fa22623acf62c60553',
} as const;

const SIGNED_KEY_REQUEST_TYPE = [
  { name: 'requestFid', type: 'uint256' },
  { name: 'key', type: 'bytes' },
  { name: 'deadline', type: 'uint256' },
] as const;

// Neynar answers 429 once the app's rate limit is reached, and the connect
// screen showed its bare axios message ("Request failed with status code
// 429"). A module function rather than a method: /integrations/function can
// call any provider method by name.
const neynarError = (err: any): never => {
  if (err?.response?.status === 429) {
    throw new Error('Farcaster rate limit reached, please try again later');
  }
  throw err;
};

@Rules(
  'Farcaster/Warpcast can only accept pictures'
)
export class FarcasterProvider
  extends SocialAbstract
  implements SocialProvider
{
  identifier = 'wrapcast';
  category = 'social' as const;
  name = 'Farcaster';
  isBetweenSteps = false;
  isWeb3 = true;
  scopes = [] as string[];
  override maxConcurrentJob = 3; // Farcaster has moderate limits
  editor = 'normal' as const;
  // A cast is measured in bytes: up to 1,024 for a long cast (Snapchain
  // cast.rs). checkValidity holds the text to that; this is the most it can
  // be when every character is one byte.
  maxLength() {
    return 1024;
  }
  dto = FarcasterDto;

  override async checkValidity(
    list: Array<ValidityMedia[]>,
    settings: any,
    additionalSettings: any[],
    texts: string[] = []
  ): Promise<string | true> {
    if (
      list?.some((item) =>
        item?.some((field) => (field?.path?.indexOf?.('mp4') ?? -1) > -1)
      )
    ) {
      return 'Can only accept images';
    }
    // Every image is an embed, and a cast takes at most 4 (engine V20).
    if (list?.some((item) => (item?.length ?? 0) > 4)) {
      return 'Farcaster casts can have up to 4 images';
    }
    if (texts.some((text) => Buffer.byteLength(text, 'utf8') > 1024)) {
      return 'Farcaster casts can be at most 1,024 bytes, and accented letters, emoji and non-Latin scripts take 2 to 4 bytes each';
    }
    return true;
  }

  async refreshToken(refresh_token: string): Promise<AuthTokenDetails> {
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
    const state = makeId(17);
    return {
      url: `${process.env.NEYNAR_CLIENT_ID}||${state}` || '',
      codeVerifier: makeId(10),
      state,
    };
  }

  async createSigner(): Promise<{
    signerUuid: string;
    approvalUrl: string;
    qrCode: string;
  }> {
    if (!process.env.NEYNAR_APP_FID || !process.env.NEYNAR_APP_MNEMONIC) {
      throw new Error(
        'Farcaster is not configured: set NEYNAR_APP_FID and NEYNAR_APP_MNEMONIC'
      );
    }

    const appFid = Number(process.env.NEYNAR_APP_FID);
    const signer = await client.createSigner().catch(neynarError);
    const deadline = Math.floor(Date.now() / 1000) + 24 * 60 * 60;
    const signature = await mnemonicToAccount(
      process.env.NEYNAR_APP_MNEMONIC
    ).signTypedData({
      domain: SIGNED_KEY_REQUEST_VALIDATOR_EIP_712_DOMAIN,
      types: { SignedKeyRequest: SIGNED_KEY_REQUEST_TYPE },
      primaryType: 'SignedKeyRequest',
      message: {
        requestFid: BigInt(appFid),
        key: signer.public_key as `0x${string}`,
        deadline: BigInt(deadline),
      },
    });

    const registered = await client
      .registerSignedKey({
        signerUuid: signer.signer_uuid,
        appFid,
        deadline,
        signature,
        ...(process.env.NEYNAR_SPONSOR_SIGNERS === 'true'
          ? { sponsor: { sponsored_by_neynar: true } }
          : {}),
      })
      .catch(neynarError);

    return {
      signerUuid: registered.signer_uuid,
      approvalUrl: registered.signer_approval_url!,
      qrCode: await toDataURL(registered.signer_approval_url!),
    };
  }

  async signerStatus(
    signerUuid: string
  ): Promise<{ status: string; code?: string }> {
    const signer = await client.lookupSigner({ signerUuid });
    if (signer.status !== 'approved') {
      return { status: signer.status };
    }

    const {
      users: [user],
    } = await client.fetchBulkUsers({ fids: [signer.fid!] });

    return {
      status: signer.status,
      code: Buffer.from(
        JSON.stringify({
          signer_uuid: signerUuid,
          fid: signer.fid,
          username: user.username,
          display_name: user.display_name,
          pfp_url: user.pfp_url,
        })
      ).toString('base64'),
    };
  }

  async authenticate(params: {
    code: string;
    codeVerifier: string;
    refresh?: string;
  }) {
    const data = JSON.parse(Buffer.from(params.code, 'base64').toString());
    return {
      id: String(data.fid),
      name: data.display_name,
      accessToken: data.signer_uuid,
      refreshToken: '',
      expiresIn: dayjs().add(200, 'year').unix() - dayjs().unix(),
      picture: data?.pfp_url || '',
      username: data.username,
    };
  }

  async post(
    id: string,
    accessToken: string,
    postDetails: PostDetails<FarcasterDto>[]
  ): Promise<PostResponse[]> {
    const [firstPost] = postDetails;
    const ids: { releaseURL: string; postId: string }[] = [];

    const channels =
      !firstPost?.settings?.subreddit ||
      firstPost?.settings?.subreddit.length === 0
        ? [undefined]
        : firstPost?.settings?.subreddit;

    for (const channel of channels) {
      const data = await client.publishCast({
        // Cast because the SDK's generated `PostCastReqBodyEmbeds` demands
        // `url`, `cast_id` *and* `castId` together. The Farcaster API accepts a
        // url-only embed — it is an `anyOf` in their schema that the OpenAPI
        // generator flattened into an all-required interface.
        embeds: (firstPost?.media?.map((media) => ({
          url: media.path,
        })) || []) as any,
        signerUuid: accessToken,
        text: firstPost.message,
        ...(channel?.value?.id ? { channelId: channel?.value?.id } : {}),
      });

      ids.push({
        // @ts-ignore
        releaseURL: `https://warpcast.com/${data.cast.author.username}/${data.cast.hash}`,
        postId: data.cast.hash,
      });
    }

    return [
      {
        id: firstPost.id,
        postId: ids.map((p) => p.postId).join(','),
        releaseURL: ids.map((p) => p.releaseURL).join(','),
        status: 'published',
      },
    ];
  }

  async comment(
    id: string,
    postId: string,
    lastCommentId: string | undefined,
    accessToken: string,
    postDetails: PostDetails<FarcasterDto>[],
    integration: Integration
  ): Promise<PostResponse[]> {
    const [commentPost] = postDetails;
    const ids: { releaseURL: string; postId: string }[] = [];

    // postId can be comma-separated if posted to multiple channels
    const parentIds = (lastCommentId || postId).split(',');

    for (const parentHash of parentIds) {
      const data = await client.publishCast({
        // Same cast as above: the generated type demands all three keys.
        embeds: (commentPost?.media?.map((media) => ({
          url: media.path,
        })) || []) as any,
        signerUuid: accessToken,
        text: commentPost.message,
        parent: parentHash,
      });

      ids.push({
        // @ts-ignore
        releaseURL: `https://warpcast.com/${data.cast.author.username}/${data.cast.hash}`,
        postId: data.cast.hash,
      });
    }

    return [
      {
        id: commentPost.id,
        postId: ids.map((p) => p.postId).join(','),
        releaseURL: ids.map((p) => p.releaseURL).join(','),
        status: 'published',
      },
    ];
  }

  @Tool({
    description: 'Search channels',
    dataSchema: [{ key: 'word', type: 'string', description: 'Search word' }],
  })
  async subreddits(
    accessToken: string,
    data: any,
    id: string,
    integration: Integration
  ) {
    const search = await client.searchChannels({
      q: data.word,
      limit: 10,
    });

    return search.channels.map((p) => {
      return {
        title: p.name,
        name: p.name,
        id: p.id,
      };
    });
  }
}
