<p align="center">
  <a href="https://postqueen.ai">
    <img src=".github/assets/header.svg" width="820" alt="PostQueen: the open-source, AI-native social media scheduler" />
  </a>
</p>

<p align="center">
  <strong>🆕 NEW:</strong> the PostQueen <a href="https://postqueen.ai/agent">Agent CLI</a> + <a href="https://postqueen.ai/mcp">MCP server</a>: plug <b>Claude&nbsp;Code, ChatGPT, Cursor, OpenClaw, Hermes</b> or <b>Codex</b> straight into your channels.
</p>

<p align="center">
  <a href="https://postqueen.ai">Website</a> ·
  <a href="https://postqueen.ai/pricing">Pricing</a> ·
  <a href="https://app.postqueen.ai/auth">Start free</a> ·
  <a href="https://docs.postqueen.ai">Docs</a> ·
  <a href="https://api.postqueen.ai/docs">API Reference</a> ·
  <a href="https://www.npmjs.com/package/postqueen">CLI</a>
</p>

<p align="center">
  <a href="https://github.com/GkhanKINAY/postqueen-app/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-AGPL--3.0-blue.svg" alt="License: AGPL-3.0"></a>
  <a href="https://www.npmjs.com/package/postqueen"><img src="https://img.shields.io/npm/v/postqueen?label=CLI&color=6d28d9" alt="CLI on npm"></a>
  <a href="https://www.npmjs.com/package/@postqueen/node"><img src="https://img.shields.io/npm/v/@postqueen/node?label=SDK&color=7c3aed" alt="SDK on npm"></a>
  <a href="https://www.npmjs.com/package/n8n-nodes-postqueen"><img src="https://img.shields.io/npm/v/n8n-nodes-postqueen?label=n8n&color=e0189e" alt="n8n node on npm"></a>
  <a href="https://github.com/GkhanKINAY/postqueen-app/commits/main"><img src="https://img.shields.io/github/commit-activity/m/GkhanKINAY/postqueen-app" alt="Commit activity"></a>
</p>

<p align="center">
  <img src=".github/assets/channels.svg" width="760" alt="Supported social networks" />
</p>

---

## What is PostQueen?

PostQueen is an **open-source, AI-native social media scheduler**. Plan a week of content once and publish everywhere, from a visual calendar, a CLI, a REST API, or straight from your favorite AI assistant. Run it as a managed cloud product with a **7-day free trial**, or self-host the whole stack for free.

This repository holds the full application: a Next.js frontend, a NestJS backend, and Temporal workers that schedule and publish your posts.

> PostQueen is a fork of [Postiz](https://github.com/gitroomhq/postiz-app) (AGPL-3.0). Huge thanks to Nevo David and the Postiz contributors for the foundation this project stands on.

## 💬 Just talk to your AI

You don't need to write a line of code. Connect PostQueen to the AI assistant you already use, then ask in plain English:

> *"Write a launch post about our new feature, generate a matching image, and schedule it for Friday at 9am on X, LinkedIn and Instagram."*

> *"Turn this blog post into a week of posts, one a day, tailored for each channel."*

> *"What should we post today? Draft three options and queue the best one for tomorrow morning."*

> *"Make a short vertical video from this photo and script, and schedule it to TikTok, YouTube Shorts and Reels."*

Your assistant drafts, designs, and schedules; **every post lands in your PostQueen queue where you can review, edit or delete it before it goes live**. Nothing publishes behind your back.

It works with the tools you already talk to: over the built-in **MCP server** or the **Agent CLI**:

<p align="center">
  <a href="https://postqueen.ai/claude-code"><b>Claude Code</b></a> ·
  <a href="https://postqueen.ai/chatgpt"><b>ChatGPT</b></a> ·
  <a href="https://postqueen.ai/cursor"><b>Cursor</b></a> ·
  <a href="https://postqueen.ai/openclaw"><b>OpenClaw</b></a> ·
  <a href="https://postqueen.ai/hermes-agent"><b>Hermes</b></a> ·
  <a href="https://postqueen.ai/codex"><b>Codex</b></a>
</p>

**Connect in one minute:** grab your API key at **[app.postqueen.ai/settings](https://app.postqueen.ai/settings)** (Developers → Public API → Reveal), then point your assistant at PostQueen:

```bash
# Claude Code (or any MCP client)
claude mcp add --transport http postqueen https://api.postqueen.ai/mcp/<YOUR_API_KEY>

# ...or install the CLI as a skill for terminal agents
npx skills add GkhanKINAY/postqueen-agent
export POSTQUEEN_API_KEY=<YOUR_API_KEY>
```

## Why PostQueen

Most social schedulers are closed SaaS, and the open ones stop at a handful of networks. PostQueen is fully open-source, self-hostable in one `docker compose up`, covers **30+ social networks** out of the box, and is **automation-first**: every action available in the UI is also a public API call, a CLI command, an SDK method, an n8n node, or an MCP tool. Run it as a managed cloud product or on your own infrastructure with no feature gates.

## Features

- [x] **Schedule** posts across 30+ networks from a single visual calendar
- [x] **AI copilot**: generate captions, images, and short videos, or plan a whole campaign
- [x] **Talk to any AI agent**: drive everything from Claude Code, ChatGPT, Cursor and more over MCP or the CLI
- [x] **Evergreen & cross-posting**: recycle content and tailor each post per channel
- [x] **Analytics**: track post and audience performance on the major networks
- [x] **Team collaboration**: roles, comments, approvals, and multi-brand workspaces
- [x] **Automation-first**: Public REST API, CLI, NodeJS SDK, n8n node, and MCP server

## 🌐 Supported networks

<details open>
<summary><strong>Major social (10)</strong></summary>

X · LinkedIn · Instagram · Facebook · TikTok · YouTube · Threads · Pinterest · Reddit · Bluesky
</details>

<details>
<summary><strong>Community & chat (8)</strong></summary>

Discord · Slack · Telegram · Mastodon · Twitch · Kick · MeWe · VK
</details>

<details>
<summary><strong>Publishing & blogs (7)</strong></summary>

WordPress · Medium · Dev.to · Hashnode · Tumblr · Listmonk · Moltbook
</details>

<details>
<summary><strong>Web3 & decentralized (3)</strong></summary>

Nostr · Farcaster · Lemmy
</details>

<details>
<summary><strong>Creator & business (4)</strong></summary>

Google Business Profile · Whop · Skool · Dribbble
</details>

> **30+ networks.** LinkedIn and Instagram each support both personal and page/professional posting, so the number of connectors runs a little higher. New connectors ship regularly.

## Quick Start

**☁️ Cloud**: skip the setup, start a **[7-day free trial](https://postqueen.ai/pricing)**, and you are posting in minutes.

**🐳 Self-host**: the whole stack runs with Docker Compose:

```bash
git clone https://github.com/GkhanKINAY/postqueen-docker-compose
cd postqueen-docker-compose
# open docker-compose.yaml and set a unique JWT_SECRET + your public URLs
docker compose up -d       # then open http://localhost:4007
```

- **Full guide:** the [Quick Start](https://docs.postqueen.ai/quickstart) covers cloud and self-host setup end to end
- **Kubernetes / Helm:** [postqueen-helmchart](https://github.com/GkhanKINAY/postqueen-helmchart)
- **Configuration:** every environment variable is documented in the [configuration reference](https://docs.postqueen.ai/configuration/reference) and this repo's [`.env.example`](.env.example)
- **Local development** of this repo: see [CONTRIBUTING.md](CONTRIBUTING.md)

## Automation & developer tools

PostQueen is API-first: drive it from your own code, from no-code pipelines, or from AI agents:

| Tool | What it is | Get started |
| --- | --- | --- |
| **Public API** | REST at `https://api.postqueen.ai/public/v1` | [API reference](https://api.postqueen.ai/docs) |
| **Agent CLI** | Model-agnostic CLI for terminals and AI agents | `npm i -g postqueen` · [docs](https://postqueen.ai/agent) |
| **MCP server** | Hosted Model Context Protocol server | `https://api.postqueen.ai/mcp/<API_KEY>` · [docs](https://postqueen.ai/mcp) |
| **NodeJS SDK** | Typed client for Node | [`@postqueen/node`](https://www.npmjs.com/package/@postqueen/node) |
| **n8n node** | No-code automation node | [`n8n-nodes-postqueen`](https://www.npmjs.com/package/n8n-nodes-postqueen) |

**Agentic scheduling:** because everything the app can do is exposed through the public API, you can point *your own* AI agent at PostQueen and let it plan, draft and schedule on a recurring basis. Get your key at [app.postqueen.ai/settings](https://app.postqueen.ai/settings) and start with the [Agent CLI](https://postqueen.ai/agent) or [MCP](https://postqueen.ai/mcp) guides.

## Tech Stack

- pnpm workspaces (monorepo)
- [Next.js](https://nextjs.org) (React): frontend
- [NestJS](https://nestjs.com): backend API
- [Prisma](https://www.prisma.io) (default: PostgreSQL)
- [Temporal](https://temporal.io): scheduling & publishing workers
- Redis: cache & queues
- [Resend](https://resend.com): email notifications

## Compliance

- PostQueen uses official, platform-approved OAuth flows.
- PostQueen does not automate or scrape content from social media platforms.
- PostQueen does not collect, store, or proxy API keys or access tokens from users.
- PostQueen never asks users to paste social platform credentials into the hosted product: users authenticate directly with each platform, ensuring platform compliance and data privacy.

## Community & Support

Questions, ideas, or bugs? [Open an issue](https://github.com/GkhanKINAY/postqueen-app/issues) or email **support@postqueen.ai**.

## Contributing & Security

- [Contributing guide](CONTRIBUTING.md)
- [Code of Conduct](CODE_OF_CONDUCT.md)
- Found a vulnerability? See [SECURITY.md](SECURITY.md)

## License

This repository's source code is available under the [AGPL-3.0 license](LICENSE).

Original work © Nevo David / Gitroom and the Postiz contributors. Modifications © PostQueen.
