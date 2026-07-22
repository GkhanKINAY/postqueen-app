<h1 align="center">👑 PostQueen</h1>

<p align="center">
  <strong>AI-powered social media scheduling</strong><br />
  Plan, generate, and publish content across 30+ social channels —<br />
  with AI agents, analytics, and team collaboration built in.
</p>

<p align="center">
  <a href="https://opensource.org/license/agpl-v3"><img src="https://img.shields.io/badge/License-AGPL%203.0-blue.svg" alt="License: AGPL-3.0"></a>
  <a href="https://www.npmjs.com/package/postqueen"><img src="https://img.shields.io/npm/v/postqueen?label=CLI&color=6d28d9" alt="CLI on npm"></a>
  <a href="https://www.npmjs.com/package/@postqueen/node"><img src="https://img.shields.io/npm/v/@postqueen/node?label=SDK&color=7c3aed" alt="SDK on npm"></a>
  <a href="https://www.npmjs.com/package/n8n-nodes-postqueen"><img src="https://img.shields.io/npm/v/n8n-nodes-postqueen?label=n8n&color=e0189e" alt="n8n node on npm"></a>
</p>

<p align="center">
  <a href="https://postqueen.ai"><strong>Website</strong></a> ·
  <a href="https://app.postqueen.ai"><strong>App</strong></a> ·
  <a href="https://api.postqueen.ai/docs"><strong>API Reference</strong></a> ·
  <a href="https://github.com/GkhanKINAY/postqueen-docs"><strong>Docs</strong></a> ·
  <a href="https://github.com/GkhanKINAY/postqueen-agent"><strong>CLI / Agent</strong></a>
</p>

---

## About this repository

PostQueen is an AI-powered social media scheduling platform. This repository holds the full application — a Next.js frontend, a NestJS backend, and Temporal workers that handle scheduling and publishing — released under the [AGPL-3.0](LICENSE) license.

> PostQueen is a fork of [Postiz](https://github.com/gitroomhq/postiz-app) (AGPL-3.0). Huge thanks to Nevo David and the Postiz contributors for the foundation this project stands on.

## Features

- **30+ social channels** (34 integrations) — Instagram, TikTok, X, LinkedIn (profile + page), YouTube, Facebook, Bluesky, Threads, Reddit, Pinterest, Mastodon, Discord, Slack, Telegram, Twitch, Kick, Tumblr, and more
- **AI-assisted content** — generate post drafts, images, and short videos
- **Visual calendar** — scheduling, evergreen recycling, and cross-posting with per-channel customization
- **Analytics** — per post and per channel
- **Team collaboration** — roles, comments, approvals, and multi-brand workspaces
- **Automation-first** — public REST API, MCP server, CLI, n8n node, and any HTTP-based tool (Zapier, Make.com)

## Tech Stack

- pnpm workspaces (monorepo)
- Next.js (React) — frontend
- NestJS — backend API
- Prisma (default: PostgreSQL)
- Temporal — scheduling & publishing workers
- Redis — cache & queues
- Resend — email notifications

## Quick Start

The fastest way to self-host is Docker Compose:

```bash
git clone https://github.com/GkhanKINAY/postqueen-docker-compose.git
cd postqueen-docker-compose
# set a unique JWT_SECRET and your public URLs in the compose env, then:
docker compose up -d
```

Then open <http://localhost:4007>.

- **Kubernetes / Helm:** [postqueen-helmchart](https://github.com/GkhanKINAY/postqueen-helmchart)
- **Configuration:** every environment variable is documented in [`.env.example`](.env.example)
- **Local development** of this repo: see [CONTRIBUTING.md](CONTRIBUTING.md)

## Automation & Developer Tools

PostQueen is API-first — automate posting from your own code or from AI agents:

| Tool | Package / Endpoint |
| --- | --- |
| **Public API** | REST at `/public/v1` — reference: [api.postqueen.ai/docs](https://api.postqueen.ai/docs) |
| **CLI / Agent** | [`postqueen`](https://www.npmjs.com/package/postqueen) — `npm i -g postqueen` |
| **NodeJS SDK** | [`@postqueen/node`](https://www.npmjs.com/package/@postqueen/node) |
| **n8n node** | [`n8n-nodes-postqueen`](https://www.npmjs.com/package/n8n-nodes-postqueen) |
| **MCP server** | connect any MCP client to `https://api.postqueen.ai/mcp/<API_KEY>` |

## Compliance

- PostQueen uses official, platform-approved OAuth flows.
- PostQueen does not automate or scrape content from social media platforms.
- PostQueen does not collect, store, or proxy API keys or access tokens from users.
- PostQueen never asks users to paste API keys into the hosted product — users authenticate directly with each social platform, ensuring platform compliance and data privacy.

## Contributing & Security

- [Contributing guide](CONTRIBUTING.md)
- [Code of Conduct](CODE_OF_CONDUCT.md)
- Found a vulnerability? See [SECURITY.md](SECURITY.md)

## License

This repository's source code is available under the [AGPL-3.0 license](LICENSE).

Original work © Nevo David / Gitroom and the Postiz contributors. Modifications © PostQueen.
