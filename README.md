<h1 align="center">👑 PostQueen</h1>

<p align="center">
<a href="https://opensource.org/license/agpl-v3">
  <img src="https://img.shields.io/badge/License-AGPL%203.0-blue.svg" alt="License">
</a>
</p>

<div align="center">
  <strong>
  <h2>AI-powered social media scheduling</h2>
  </strong>
  PostQueen helps you plan, generate, and publish content across all major social networks —<br />
  with AI agents, analytics, and team collaboration built in.
</div>

<p align="center">
  <br />
  <a href="https://postqueen.ai"><strong>postqueen.ai »</strong></a>
  <br />
</p>

## About this repository

PostQueen is an AI-powered social media scheduling platform, published under the [AGPL-3.0](LICENSE) license. It builds on open-source foundations — huge thanks to Nevo David and the Postiz contributors for the work this project stands on.

- Documentation: https://docs.postqueen.ai

## Features

- Schedule posts across 30+ social platforms — Instagram, TikTok, X, LinkedIn, YouTube, Facebook, Bluesky, Threads, Reddit, Pinterest, Mastodon, Discord, Slack, Telegram, and more
- AI-assisted content: post drafts, images, and short videos
- Visual calendar, evergreen post recycling, cross-posting with per-channel customization
- Analytics per post and per channel
- Team collaboration with roles and multi-brand workspaces
- Public REST API (`/public/v1`) plus n8n, Make.com, and Zapier automation

## Tech Stack

- pnpm workspaces (monorepo)
- NextJS (React)
- NestJS
- Prisma (default to PostgreSQL)
- Temporal
- Resend (email notifications)

## Quick Start

See the [Quick Start Guide](https://docs.postqueen.ai/quickstart). Docker Compose and Helm setups live in [postqueen-docker-compose](https://github.com/GkhanKINAY/postqueen-docker-compose) and [postqueen-helmchart](https://github.com/GkhanKINAY/postqueen-helmchart).

## Compliance

- PostQueen uses official, platform-approved OAuth flows.
- PostQueen does not automate or scrape content from social media platforms.
- Users always authenticate directly with the social platform, ensuring platform compliance and data privacy.

## License

This repository's source code is available under the [AGPL-3.0 license](LICENSE).

Original work © Nevo David / Gitroom and the Postiz contributors. Modifications © PostQueen.
