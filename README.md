<p align="center">
  <a href="https://postqueen.ai">
    <img src=".github/assets/header.svg" width="840" alt="PostQueen: your AI social media assistant" />
  </a>
</p>

<h3 align="center">🆕&nbsp; NEW: the PostQueen <a href="https://postqueen.ai/agent">Agent CLI</a> + <a href="https://postqueen.ai/mcp">MCP server</a>: plug Claude&nbsp;Code, ChatGPT, Cursor, OpenClaw, Hermes or Codex straight into your channels.</h3>

<br/>

<div align="center">
  <h2>The queen of your posts 👑</h2>
  <p>
    She writes your best hooks, makes the visuals, and runs every social channel for you.<br/>
    You say the word; she does the rest, and <strong>nothing goes out without your approval</strong>.
  </p>
  <p><em>An open-source alternative to Buffer, Hootsuite, Sprout Social and Later.</em></p>
</div>

<br/>

<p align="center">
  <a href="https://postqueen.ai">Website</a> &nbsp;·&nbsp;
  <a href="https://postqueen.ai/pricing">Pricing</a> &nbsp;·&nbsp;
  <a href="https://app.postqueen.ai/auth">Start free</a> &nbsp;·&nbsp;
  <a href="https://docs.postqueen.ai">Docs</a> &nbsp;·&nbsp;
  <a href="https://api.postqueen.ai/docs">API Reference</a> &nbsp;·&nbsp;
  <a href="https://www.npmjs.com/package/postqueen">CLI</a>
</p>

<p align="center">
  <a href="https://github.com/GkhanKINAY/postqueen-app/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-AGPL--3.0-blue.svg" alt="License: AGPL-3.0"></a>
  <a href="https://www.npmjs.com/package/postqueen"><img src="https://img.shields.io/npm/v/postqueen?label=CLI&color=6d28d9" alt="CLI on npm"></a>
  <a href="https://www.npmjs.com/package/@postqueen/node"><img src="https://img.shields.io/npm/v/@postqueen/node?label=SDK&color=7c3aed" alt="SDK on npm"></a>
  <a href="https://www.npmjs.com/package/n8n-nodes-postqueen"><img src="https://img.shields.io/npm/v/n8n-nodes-postqueen?label=n8n&color=e0189e" alt="n8n node on npm"></a>
  <a href="https://github.com/GkhanKINAY/postqueen-app/commits/main"><img src="https://img.shields.io/github/commit-activity/m/GkhanKINAY/postqueen-app" alt="Commit activity"></a>
</p>

<br/>

<p align="center">
  <img src=".github/assets/channels.svg" width="780" alt="Supported social networks" />
</p>

<p align="center">
  <a href="https://docs.postqueen.ai"><strong>Explore the docs »</strong></a>
  &nbsp;&nbsp;·&nbsp;&nbsp;
  <a href="https://postqueen.ai/pricing"><strong>Start a 7-day free trial »</strong></a>
</p>

<br/>

> PostQueen is a fork of [Postiz](https://github.com/gitroomhq/postiz-app) (AGPL-3.0). Huge thanks to Nevo David and the Postiz contributors for the foundation this project stands on.

---

## ✨ What PostQueen does for you

- ✍️ **Writes the post.** Hooks, captions and threads in your voice, shaped for each platform.
- 🎨 **Makes the visuals.** Generate images and short vertical videos with no design tools.
- 📅 **Schedules everywhere.** One idea, tailored per channel, published across 30+ networks.
- ✅ **Waits for your approval.** Every post lands in your queue to review, edit or delete first.
- 📈 **Shows what works.** Post and audience analytics on the major networks.
- 👥 **Brings your team.** Roles, comments, approvals and multi-brand workspaces.

Run it as a managed cloud product with a 7-day free trial, or self-host the whole stack for free.

---

## 💬 Just talk to your AI

You don't need to write a line of code. Connect PostQueen to the AI assistant you already use, then just ask:

> *"Post about our launch on X and LinkedIn tomorrow morning."*

> *"Turn this blog post into a week of posts, one a day."*

> *"Make an image for this post and schedule it for Friday at 9am."*

> *"What should I post today? Give me three ideas and queue the best one."*

Your assistant writes it, designs it, and drops it into your **PostQueen queue**, where you review and approve before anything goes live. It talks to the tools you already use:

<p align="center">
  <a href="https://postqueen.ai/claude-code"><b>Claude Code</b></a> &nbsp;·&nbsp;
  <a href="https://postqueen.ai/chatgpt"><b>ChatGPT</b></a> &nbsp;·&nbsp;
  <a href="https://postqueen.ai/cursor"><b>Cursor</b></a> &nbsp;·&nbsp;
  <a href="https://postqueen.ai/openclaw"><b>OpenClaw</b></a> &nbsp;·&nbsp;
  <a href="https://postqueen.ai/hermes-agent"><b>Hermes</b></a> &nbsp;·&nbsp;
  <a href="https://postqueen.ai/codex"><b>Codex</b></a>
</p>

> 🔑 **First, grab your API key** at **[app.postqueen.ai/settings](https://app.postqueen.ai/settings)** (Developers → Public API → Reveal). You will use it in every option below.

---

## 🔌 Connect over MCP

The [Model Context Protocol](https://modelcontextprotocol.io) lets AI assistants call tools. PostQueen ships a hosted MCP server, so any MCP client can draft, schedule and manage posts as if it were built in.

**One-line connect (Claude Code or any CLI client):**

```bash
claude mcp add --transport http postqueen https://api.postqueen.ai/mcp/<YOUR_API_KEY>
```

**Config-file clients (Claude Desktop, Cursor, and others):**

```json
{
  "mcpServers": {
    "postqueen": {
      "url": "https://api.postqueen.ai/mcp/<YOUR_API_KEY>"
    }
  }
}
```

**ChatGPT:** Settings → Connectors → add a custom connector pointing at `https://api.postqueen.ai/mcp/<YOUR_API_KEY>`.

Works with **Claude Code, ChatGPT, Cursor, OpenClaw, Hermes, Codex** and any other MCP client (Gemini CLI, Aider, Cline, Warp, or your own). Full guide: [postqueen.ai/mcp](https://postqueen.ai/mcp).

---

## ⌨️ Agent CLI

Prefer the terminal, or building an agent that runs commands? The `postqueen` CLI drives everything and returns clean JSON, so any model-agnostic agent can use it.

```bash
npm i -g postqueen
postqueen auth:login          # opens a browser device flow
postqueen integrations:list   # your connected channels
postqueen posts:create -c "Hello from PostQueen" -s "2026-01-01T09:00:00Z" -i <integration-id>
```

Install it as a skill for terminal agents with `npx skills add GkhanKINAY/postqueen-agent`. Full command reference: [postqueen-agent](https://github.com/GkhanKINAY/postqueen-agent) and [postqueen.ai/agent](https://postqueen.ai/agent).

---

## 🤖 Build your own agent (agentic scheduling)

Because every action in the app is also a public API call, you can point **your own** AI agent at PostQueen and let it plan, draft and schedule on its own, on a recurring schedule if you like. A "heartbeat" job can check a folder or a prompt, generate the week's posts, and queue them, all while a human stays in the loop: **nothing publishes until it is approved**. Start from the [Agent CLI](https://postqueen.ai/agent) or [MCP](https://postqueen.ai/mcp) guides.

---

## 🧩 Public API, SDK & n8n

Everything the dashboard does is a REST call, so you can wire PostQueen into any stack:

| Tool | What it is | Get started |
| --- | --- | --- |
| **Public API** | REST at `https://api.postqueen.ai/public/v1` | [API reference](https://api.postqueen.ai/docs) |
| **NodeJS SDK** | Typed client for Node | [`@postqueen/node`](https://www.npmjs.com/package/@postqueen/node) |
| **n8n node** | No-code automation node | [`n8n-nodes-postqueen`](https://www.npmjs.com/package/n8n-nodes-postqueen) |
| **Webhooks** | Get notified when posts publish | [docs](https://docs.postqueen.ai) |

A first request, listing your connected channels:

```bash
curl https://api.postqueen.ai/public/v1/integrations \
  -H "Authorization: $POSTQUEEN_API_KEY"
```

Plug the same API into Make.com, Zapier or your own scripts.

---

## 🌐 Supported networks

PostQueen publishes to **30+ social networks** out of the box:

| Group | Networks |
| --- | --- |
| **Major social** | X · LinkedIn · Instagram · Facebook · TikTok · YouTube · Threads · Pinterest · Reddit · Bluesky |
| **Community & chat** | Discord · Slack · Telegram · Mastodon · Twitch · Kick · MeWe · VK |
| **Publishing & blogs** | WordPress · Medium · Dev.to · Hashnode · Tumblr · Listmonk · Moltbook |
| **Web3 & decentralized** | Nostr · Farcaster · Lemmy |
| **Creator & business** | Google Business Profile · Whop · Skool · Dribbble |

LinkedIn and Instagram each support both personal and page/professional posting, so the number of connectors runs a little higher. New connectors ship regularly.

---

## 🚀 Quick start

**☁️ Cloud.** Skip the setup, start a [7-day free trial](https://postqueen.ai/pricing), and you are posting in minutes.

**🐳 Self-host.** The whole stack runs with Docker Compose:

```bash
git clone https://github.com/GkhanKINAY/postqueen-docker-compose
cd postqueen-docker-compose
# open docker-compose.yaml and set a unique JWT_SECRET + your public URLs
docker compose up -d       # then open http://localhost:4007
```

- **Full guide:** the [Quick Start](https://docs.postqueen.ai/quickstart) covers cloud and self-host end to end.
- **Kubernetes / Helm:** [postqueen-helmchart](https://github.com/GkhanKINAY/postqueen-helmchart).
- **Configuration:** every environment variable is documented in the [configuration reference](https://docs.postqueen.ai/configuration/reference) and this repo's [`.env.example`](.env.example).
- **Local development** of this repo: see [CONTRIBUTING.md](CONTRIBUTING.md).

---

## 🧱 Tech stack

- pnpm workspaces (monorepo)
- [Next.js](https://nextjs.org) (React) for the frontend
- [NestJS](https://nestjs.com) for the backend API
- [Prisma](https://www.prisma.io) (default: PostgreSQL)
- [Temporal](https://temporal.io) for scheduling and publishing workers
- Redis for cache and queues
- [Resend](https://resend.com) for email notifications

---

## 🛡️ Compliance

- PostQueen is an open-source, self-hostable social media scheduler that supports X, LinkedIn, Instagram, Bluesky, Mastodon, Discord and 30+ more.
- The hosted service uses official, platform-approved OAuth flows.
- PostQueen does not automate or scrape content from social media platforms.
- PostQueen does not collect, store, or proxy API keys or access tokens from users.
- PostQueen never asks users to paste social-platform credentials into the hosted product.
- Users always authenticate directly with each platform (X, LinkedIn, Discord, and so on), which keeps every platform's compliance and your data privacy intact.

---

## ❤️ Community & Support

We would love to hear from you, whether you hit a bug, have an idea, or just want to say hi:

- 🐛 **Found a bug or have a feature idea?** [Open an issue](https://github.com/GkhanKINAY/postqueen-app/issues).
- 💌 **Need a hand?** Email **support@postqueen.ai**.
- 📚 **Getting started?** The [docs](https://docs.postqueen.ai) walk you through everything.

If PostQueen saves you time, a ⭐ on the repo genuinely helps other people find it.

## Contributing & Security

- [Contributing guide](CONTRIBUTING.md)
- [Code of Conduct](CODE_OF_CONDUCT.md)
- Found a vulnerability? See [SECURITY.md](SECURITY.md)

## License

This repository's source code is available under the [AGPL-3.0 license](LICENSE).

Original work © Nevo David / Gitroom and the Postiz contributors. Modifications © PostQueen.
