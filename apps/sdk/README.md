# PostQueen Node.js SDK

<a href="https://app.postqueen.ai/auth?utm_source=npm&utm_medium=readme&utm_campaign=postqueen-sdk&utm_content=npm-banner"><img src="https://raw.githubusercontent.com/GkhanKINAY/postqueen-app/main/.github/assets/sdk-banner-light.png" width="100%" alt="PostQueen Node SDK. Schedule posts from your own code: a typed Node.js client for the PostQueen API."></a>

<p>
  <a href="https://www.npmjs.com/package/@postqueen/node"><img src="https://img.shields.io/npm/v/@postqueen/node?label=npm&color=CB3837&labelColor=15131C&logo=npm&logoColor=white" alt="npm version"></a>
  <a href="https://www.npmjs.com/package/@postqueen/node"><img src="https://img.shields.io/npm/dm/@postqueen/node?color=7C3AED&labelColor=15131C" alt="npm downloads"></a>
  <a href="https://github.com/GkhanKINAY/postqueen-app/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-AGPL--3.0-2563EB?labelColor=15131C" alt="License: AGPL-3.0"></a>
</p>

<a href="https://docs.postqueen.ai/agents/grok-bot"><img src="https://raw.githubusercontent.com/GkhanKINAY/postqueen-app/main/.github/assets/showcase/announce-light.png" width="100%" alt="New: Grok Bot is here. Connect Claude, ChatGPT, Grok Bot or any AI agent to your socials."></a>

<p><a href="https://app.postqueen.ai/auth?utm_source=npm&utm_medium=readme&utm_campaign=postqueen-sdk&utm_content=npm-button"><img src="https://raw.githubusercontent.com/GkhanKINAY/postqueen-app/main/.github/assets/showcase/btn-trial-light.png" width="351" alt="Start 7-day trial for $0"></a><a href="https://docs.postqueen.ai/agents/overview"><img src="https://raw.githubusercontent.com/GkhanKINAY/postqueen-app/main/.github/assets/showcase/btn-agent-light.png" width="325" alt="Connect your AI agent"></a></p>

<sub><b>$0 due today.</b> A card is required, and you pay nothing if you cancel within 7 days.</sub>

<a href="https://docs.postqueen.ai/agents/overview"><img src="https://raw.githubusercontent.com/GkhanKINAY/postqueen-app/main/.github/assets/showcase/works-light.png" width="100%" alt="Use the agent you already have: Claude, ChatGPT, Grok Bot (new), Grok, Perplexity, Muse (new), Claude Code, Codex, Cursor, Gemini CLI, VS Code, Devin Desktop, Zed, OpenClaw, Hermes, NanoClaw, Paperclip and any MCP app. Posts to 30+ networks."></a>

Typed Node client for the [PostQueen](https://postqueen.ai) public API. Schedule posts, upload
media and read your connected channels across 30+ networks, from X and LinkedIn to TikTok and
YouTube, with a handful of methods and full types.

## Install

```bash
npm install @postqueen/node
```

No account yet? [Start a 7-day trial, $0 due today](https://app.postqueen.ai/auth?utm_source=npm&utm_medium=readme&utm_campaign=postqueen-sdk&utm_content=install). Get your API key in [PostQueen](https://app.postqueen.ai) under **Connections > API Keys**. Only
workspace admins see it.

## Quick start

```typescript
import fs from 'fs';
import PostQueen from '@postqueen/node';

const postqueen = new PostQueen(process.env.POSTQUEEN_API_KEY!);

// Which channels can I post to?
const channels = await postqueen.integrations();

// Upload media first: TikTok, Instagram and YouTube only accept trusted URLs
const media = await postqueen.upload(fs.readFileSync('./launch.png'), 'png');

// Schedule the post
await postqueen.post({
  type: 'schedule',
  date: '2026-08-01T09:00:00Z',
  posts: [
    {
      integration: { id: channels[0].id },
      value: [
        {
          content: 'We just shipped 🎉',
          image: [{ id: media.id, path: media.path }],
        },
      ],
    },
  ],
});
```

`type` is one of `draft`, `schedule`, `now` or `update`. `date` (ISO 8601) and at least one entry in
`posts` are required. `shortLink` defaults to `false`, `tags` to `[]` and each part's `image` to
`[]`. Per-network options go into each post's `settings` object; the
[posting settings](https://docs.postqueen.ai/public-api/providers/overview) list them for every
network. A network without required settings needs none.

## API

| Method | Returns |
| --- | --- |
| `post(posts: CreatePostInput)` | Schedule a post; returns parsed JSON |
| `postList(filters: GetPostsDto)` | List posts in a date range; returns parsed JSON |
| `upload(file: Buffer, extension: string)` | Upload an image or video; returns parsed JSON with the hosted `path` |
| `integrations()` | List connected channels; returns parsed JSON |
| `deletePost(id: string)` | Delete a post; returns the raw `Response`, so call `.json()` yourself if you need the body |

`upload()` maps the extension to a content type: `png`, `jpg`, `jpeg`, `gif`, `webp`, `mp4` and `mov` are recognized. A video comes back with `status: "processing"` while PostQueen prepares it; an MP4 can go into a post right away.

The methods return the API's JSON as it comes, error answers included, so check it before you use it.

## Self-hosted instances

Pass your own API base URL as the second constructor argument, or set `POSTQUEEN_API_URL`:

```typescript
const postqueen = new PostQueen(apiKey, 'https://yourdomain.com/api');
```

## Other ways to reach the same API

| | |
| --- | --- |
| API reference | [docs.postqueen.ai/public-api](https://docs.postqueen.ai/public-api/introduction) |
| Documentation | [docs.postqueen.ai](https://docs.postqueen.ai) |
| CLI | [`postqueen`](https://www.npmjs.com/package/postqueen) |
| n8n node | [`n8n-nodes-postqueen`](https://www.npmjs.com/package/n8n-nodes-postqueen) |
| MCP server | `https://api.postqueen.ai/mcp/<YOUR_API_KEY>` |
| Source and issues | [github.com/GkhanKINAY/postqueen-app](https://github.com/GkhanKINAY/postqueen-app) |

**No PostQueen account yet?** The SDK calls PostQueen Cloud: start a trial, copy the key from Connections > API Keys, and your code can post.

<a href="https://app.postqueen.ai/auth?utm_source=npm&utm_medium=readme&utm_campaign=postqueen-sdk&utm_content=npm-closing-band"><img src="https://raw.githubusercontent.com/GkhanKINAY/postqueen-app/main/.github/assets/showcase/cta-light.png" width="100%" alt="Ready when you are: hand your next post to your agent. Start 7-day trial for $0. $0 due today, cancel in one click."></a>

## License

[AGPL-3.0](https://github.com/GkhanKINAY/postqueen-app/blob/main/LICENSE). PostQueen is a fork of
[Postiz](https://github.com/gitroomhq/postiz-app) by Nevo David / Gitroom. Thank you to the Postiz
contributors for the foundation this builds on.
