<p align="center">
  <a href="https://postqueen.ai">
    <img src=".github/assets/header.svg" width="840" alt="PostQueen: the queen of your posts, your AI social media assistant" />
  </a>
</p>

<h3 align="center">🆕&nbsp; NEW: run your social media just by talking to your AI. Plan a month of content, generate it and schedule it to 30+ networks, then review it all on a visual calendar.</h3>

<br/>

<p align="center">
  <strong>Stop writing posts by hand.</strong> Tell PostQueen what is happening, a sale, a new product, a milestone, and she finds the best hook, picks a photo in your brand colors, writes a version for every platform, and lines it up on your calendar. A social media manager that never sleeps, for a creator or a whole company.
</p>

<p align="center">
  <strong>PostQueen</strong> is an open-source alternative to <strong>Buffer, Hootsuite, Sprout Social, Later</strong> and more.
</p>

<br/>

<p align="center">
  <a href="https://postqueen.ai">Website</a> &nbsp;·&nbsp;
  <a href="https://postqueen.ai/pricing">Pricing</a> &nbsp;·&nbsp;
  <a href="https://docs.postqueen.ai">Docs</a> &nbsp;·&nbsp;
  <a href="https://api.postqueen.ai/docs">API Reference</a> &nbsp;·&nbsp;
  <a href="https://postqueen.ai/agent">Agents</a> &nbsp;·&nbsp;
  <a href="https://postqueen.ai/mcp">MCP</a> &nbsp;·&nbsp;
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
  <img src=".github/assets/channels.svg" width="780" alt="Publishes to 30+ social networks" />
</p>

<p align="center">
  <a href="https://postqueen.ai"><img src=".github/assets/cta-cloud.svg" height="48" alt="Start free for 7 days" /></a>
  &nbsp;&nbsp;
  <a href="https://github.com/GkhanKINAY/postqueen-docker-compose"><img src=".github/assets/cta-selfhost.svg" height="48" alt="Self-host it free" /></a>
</p>

---

## 👑 Everything PostQueen does for you

<p align="center">
  <img src=".github/assets/features.svg" width="880" alt="Scheduling, AI Assistant, AI Design, AI Video, Auto Actions, Teamwork, Analytics, Cross-posting" />
</p>

All of it is real, and all of it is yours to run: PostQueen is fully open-source, so you can use the managed cloud or host the whole thing yourself.

---

## 💬 Just talk to your AI

Think of PostQueen as the social media manager on your team, one you simply talk to. Tell her what is happening and she does the thinking: she finds a hook that fits your topic, picks an image with colors that match your brand, writes a version for each platform, and drops it on your calendar. Ask her in plain words, in **your own language** (PostQueen speaks 16 languages, Turkish included), by text or, if your assistant supports voice, hands-free by speaking.

Just say what you want:

> *"Plan a month of content for our coffee shop and fill the calendar."*

> *"Take this photo of today's special and put it on Instagram at lunchtime."*

> *"We just hit 10k followers, write a warm thank-you post for all our channels."*

> *"Turn my latest YouTube video into posts for X, LinkedIn and Threads."*

**You stay in control.** Everything lands in your calendar first, so you can read it, tweak it, or delete it before it goes out. Prefer to sign off on every single post? Ask her to save them as drafts, and nothing publishes until you schedule it yourself.

<br/>

<p align="center">
  <img src=".github/assets/works-with.svg" width="760" alt="Works with Claude Code, ChatGPT, Cursor, OpenClaw, Hermes, Codex" />
</p>

Already using an AI assistant? Point it at PostQueen and it runs everything over the same Agent CLI and hosted MCP server.

**Here is [Claude Code](https://postqueen.ai/claude-code) doing it end to end** from one sentence:

> *"Announce our new summer menu on X and Instagram tomorrow at noon, and use the photo in `./menu.jpg`."*

```bash
postqueen integrations:list
postqueen upload ./menu.jpg
postqueen posts:create \
  -c "Our summer menu is here 🌞" \
  -m "<uploaded-url>" \
  -s "2026-06-01T12:00:00Z" \
  -i "<instagram-id>"
```

**Prefer another assistant?** Same setup, you just talk to it:

<table>
  <tr>
    <th align="left">Assistant</th>
    <th align="left">Try saying</th>
  </tr>
  <tr>
    <td valign="top"><strong><a href="https://postqueen.ai/openclaw">OpenClaw&nbsp;»</a></strong><br/><sub>WhatsApp, Telegram, Slack, Discord</sub></td>
    <td valign="top"><em>"Create a week of gym content: a tip, a quote and a class reminder, and schedule them all."</em></td>
  </tr>
  <tr>
    <td valign="top"><strong><a href="https://postqueen.ai/hermes-agent">Hermes&nbsp;»</a></strong><br/><sub>Plans and runs multi-step routines</sub></td>
    <td valign="top"><em>"Every Monday, plan the week's posts for our bakery and fill the calendar."</em></td>
  </tr>
  <tr>
    <td valign="top"><strong><a href="https://postqueen.ai/chatgpt">ChatGPT&nbsp;»</a></strong><br/><sub>Draft, refine, then publish</sub></td>
    <td valign="top"><em>"Write a fun post about our weekend sale, make a matching image, and schedule it for Friday morning on Instagram and Facebook."</em></td>
  </tr>
  <tr>
    <td valign="top"><strong><a href="https://postqueen.ai/codex">Codex&nbsp;»</a></strong><br/><sub>OpenAI's software agent</sub></td>
    <td valign="top"><em>"Draft a short daily tip for our brand and schedule one for each morning next week."</em></td>
  </tr>
  <tr>
    <td valign="top"><strong><a href="https://postqueen.ai/cursor">Cursor&nbsp;»</a></strong><br/><sub>Right inside your editor</sub></td>
    <td valign="top"><em>"Turn our latest blog post into three posts and space them across next week."</em></td>
  </tr>
</table>

**And any other agent.** PostQueen's CLI and MCP server are model-agnostic, so any MCP client or command-running agent works too: **Gemini CLI, Aider, Cline, Warp, Windsurf**, or your own scripts.

---

## 🌐 Supported networks

PostQueen publishes to **30+ social networks** out of the box:

<p align="center">
  <img src=".github/assets/channels.svg" width="820" alt="Supported social networks" />
</p>

- **Major social:** X, LinkedIn, Instagram, Facebook, TikTok, YouTube, Threads, Pinterest, Reddit, Bluesky
- **Community & chat:** Discord, Slack, Telegram, Mastodon, Twitch, Kick, MeWe, VK
- **Publishing & blogs:** WordPress, Medium, Dev.to, Hashnode, Tumblr, Listmonk, Moltbook
- **Web3 & decentralized:** Nostr, Farcaster, Lemmy
- **Creator & business:** Google Business Profile, Whop, Skool, Dribbble

LinkedIn and Instagram each support both personal and page posting, so the number of connectors runs a little higher. New connectors ship regularly.

---

## 🚀 Get started

PostQueen is **fully open-source (AGPL-3.0)**. Pick whichever way suits you:

### ☁️ Cloud

The fastest way to start: connect your channels and schedule your first post in minutes, with a **7-day free trial** and nothing to run yourself. [Start free »](https://postqueen.ai)

### 🐳 Self-host

Own your data and run the whole stack for free. You will need Docker, about 4 GB of RAM, and a domain with TLS (social networks send their OAuth callbacks there).

```bash
git clone https://github.com/GkhanKINAY/postqueen-docker-compose
cd postqueen-docker-compose
# open docker-compose.yaml and set a unique JWT_SECRET and your public URLs
docker compose up -d          # then open http://localhost:4007
```

The stack runs the app, PostgreSQL, Redis and a Temporal cluster (the engine that publishes on time). For the full walkthrough see the [self-host guide](https://docs.postqueen.ai/quickstart), for Kubernetes see [postqueen-helmchart](https://github.com/GkhanKINAY/postqueen-helmchart), and every setting is documented in the [configuration reference](https://docs.postqueen.ai/configuration/reference).

---

## 🧱 Tech stack

- **pnpm workspaces** (monorepo)
- **[Next.js](https://nextjs.org)** (React) for the frontend
- **[NestJS](https://nestjs.com)** for the backend API
- **[Prisma](https://www.prisma.io)** (default: PostgreSQL)
- **[Temporal](https://temporal.io)** for scheduling and publishing workers
- **Redis** for cache and queues
- **[Resend](https://resend.com)** for email notifications

---

## 🔑 Get your API key

You will need an API key to use the CLI, the MCP server, the SDK or the public API. It takes a minute:

1. Open **[app.postqueen.ai/settings](https://app.postqueen.ai/settings)** (or your own self-hosted instance).
2. Go to **Developers → Public API**.
3. Click **Reveal** to show your key.
4. Copy it and set it in your shell:

```bash
export POSTQUEEN_API_KEY="your_api_key"
```

Keep it secret: it grants full access to your account. You can revoke or rotate it any time from the same screen.

---

## 🔌 Connect over MCP

The [Model Context Protocol](https://modelcontextprotocol.io) lets AI assistants call tools. PostQueen ships a hosted MCP server, so any MCP client can draft, schedule and manage posts as if it were built in.

**One line (Claude Code or any CLI client):**

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

**ChatGPT:** Settings → Connectors → add a custom connector pointing at `https://api.postqueen.ai/mcp/<YOUR_API_KEY>`. Full guide: [postqueen.ai/mcp](https://postqueen.ai/mcp).

## ⌨️ Agent CLI

Prefer the terminal, or building an agent that runs commands? The `postqueen` CLI drives everything and returns clean JSON.

```bash
npm i -g postqueen
postqueen auth:login          # opens a browser device flow
postqueen integrations:list   # your connected channels
postqueen posts:create -c "Hello from PostQueen" -s "2026-01-01T09:00:00Z" -i <integration-id>
```

Install it as a skill for terminal agents with `npx skills add GkhanKINAY/postqueen-agent`. Full reference: [postqueen-agent](https://github.com/GkhanKINAY/postqueen-agent).

## 🤖 Build your own agent

Because every action is a public API call, you can point your own agent at PostQueen and let it plan, draft and schedule on a schedule you set. A simple recurring job can wake up, decide what to post, and queue it. Start from the [Agent CLI](https://postqueen.ai/agent) or [MCP](https://postqueen.ai/mcp) guides.

## 🧩 Public API, SDK & n8n

| Tool | What it is | Get started |
| --- | --- | --- |
| **Public API** | REST at `https://api.postqueen.ai/public/v1` | [API reference](https://api.postqueen.ai/docs) |
| **NodeJS SDK** | Typed client for Node | [`@postqueen/node`](https://www.npmjs.com/package/@postqueen/node) |
| **n8n node** | No-code automation node | [`n8n-nodes-postqueen`](https://www.npmjs.com/package/n8n-nodes-postqueen) |
| **Webhooks** | Get notified when posts publish | [docs](https://docs.postqueen.ai) |

```bash
curl https://api.postqueen.ai/public/v1/integrations \
  -H "Authorization: $POSTQUEEN_API_KEY"
```

Plug the same API into Make.com, Zapier or your own scripts.

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

## 💜 Why we built PostQueen, and a thank you

We believe the way we work is about to change. AI is getting better every month, and before long, getting real work done by simply talking to an assistant will feel completely normal. We wanted to build something for that shift, in the spirit of tools we admire like [Chatbase](https://www.chatbase.co) and [Wispr Flow](https://wisprflow.ai).

Social media felt like the perfect place to start: it takes real time and effort, and most of it is work an assistant can carry for you. When we found that Nevo David had open-sourced [Postiz](https://github.com/gitroomhq/postiz-app) under AGPL-3.0, we knew we had the foundation we needed. [PostQueen](https://postqueen.ai) grows that work in its own direction: an assistant that runs your social media, so you can spend your time on everything else.

Thank you, Nevo David and the Postiz contributors. We could not have started this without you. 🙏💜

## License

This repository's source code is available under the [AGPL-3.0 license](LICENSE). Original work © Nevo David / Gitroom and the Postiz contributors. Modifications © PostQueen.
