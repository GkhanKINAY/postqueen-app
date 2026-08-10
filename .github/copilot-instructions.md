
# Copilot Coding Agent Instructions for PostQueen

## Project Architecture
- pnpm workspace (`pnpm-workspace.yaml`), with apps in `apps/` and shared code in `libraries/`. There is no NX.
- Main services: `frontend` (Next.js), `backend` (NestJS), `orchestrator` (NestJS + Temporal, background jobs). Also `commands`, `extension` and `sdk`.
- Data layer uses Prisma ORM (`libraries/nestjs-libraries/src/database/prisma/schema.prisma`) with PostgreSQL as the default database. Prisma 7: the generator is `prisma-client`, config lives in `prisma.config.ts`, and the client is generated — never commit it.
- Redis (BullMQ) is used for queues and caching.
- Email notifications via Resend.
- Social login integrations (Instagram, Facebook) and Make.com/N8N integrations.

## Developer Workflows
- Use the Node version in `.nvmrc` (22.20.0) and pnpm 10.6.1 (`packageManager` in package.json). `engines` requires >=22.13.0 because `@mastra/*` does.
- Install dependencies: `pnpm install`
- Build all apps: `pnpm run build`
- Run all apps in dev mode: `pnpm run dev`
- There is no unit test suite. What stands in for one is `scripts/ui-migration-check.sh` (types, API surface, i18n keys, routes, feature gates, reduced-motion loops — all diffed against `docs/ui-migration-baseline/`) and `scripts/boot-check.sh`, which starts a real Nest application context from each service's build output. A green build is not evidence on its own; boot-check exists because that mistake once took production down.
- Individual app scripts are in each app's `package.json` (e.g., `pnpm --filter ./apps/backend run dev`).
- Prisma DB commands: `pnpm run prisma-generate`, `pnpm run prisma-db-push`, `pnpm run prisma-reset`. Run `pnpm run prisma-db-pull` after any `@mastra/*` upgrade — Mastra owns tables the schema does not describe, and `db push --accept-data-loss` (which is what containers run at start) will drop every one it has not been told about.
- Docker: `docker compose -f ./docker-compose.dev.yaml up -d`
- Start built apps with `pnpm run start:prod:backend` / `start:prod:frontend`, never bare `node main.js` / `next start` — the root `.env` is loaded by `dotenv -e ../../.env --` inside those scripts, and without it the frontend renders an endless skeleton.

## Conventions & Patterns
- Use conventional commits (`feat:`, `fix:`, `chore:`).
- PRs should include clear descriptions, related issue links, and UI screenshots/GIFs if relevant.
- Comments are required for complex logic.
- Shared code lives in `libraries/` (e.g., helpers, React shared libraries, NestJS modules).
- Environment variables are managed via `.env` and referenced in Docker and scripts.
- Make sure to keep the `.env.example` file updated with new environment variables.

## Integration Points
- External APIs: Social media (Instagram, Facebook), Make.com, N8N, Resend, Stripe, etc.
- SDK (`apps/sdk`) provides programmatic access to PostQueen features.
- Extension (`apps/extension`) is built with Vite, React, TypeScript, and Tailwind CSS.

## Key Files & Directories
- `apps/` — Main services and applications
- `libraries/` — Shared code and modules
- `docker-compose.dev.yaml` — Local development Docker setup
- `.env` — Environment configuration
- `prisma.config.ts` — Prisma 7 schema, migration and datasource settings (replaces the `--schema` flag)
- `scripts/ui-migration-check.sh`, `scripts/boot-check.sh` — the two gates every change goes through
- `pnpm-workspace.yaml` — Workspace package management
- `README.md` — General project overview
- `libraries/nestjs-libraries/src/database/prisma/schema.prisma` — Database schema

## Documentation
- Main docs: https://docs.postqueen.ai/
- Developer guide: https://docs.postqueen.ai/developer-guide
- Public API: https://docs.postqueen.ai/public-api

---

# Logs

- Where logs are used, ensure Sentry is imported using `import * as Sentry from "@sentry/nextjs"`
- Enable logging in Sentry using `Sentry.init({ enableLogs: true })`
- Reference the logger using `const { logger } = Sentry`
- Sentry offers a `consoleLoggingIntegration` that can be used to log specific console error types automatically without instrumenting the individual logger calls

## Configuration

The Sentry initialization needs to be updated to enable the logs feature.

### Baseline

```javascript
import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  enableLogs: true,
});
```

### Logger Integration

```javascript
Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  integrations: [
    // send console.log, console.error, and console.warn calls as logs to Sentry
    Sentry.consoleLoggingIntegration({ levels: ["log", "error", "warn"] }),
  ],
});
```

## Logger Examples

`logger.fmt` is a template literal function that should be used to bring variables into the structured logs.

```javascript
import * as Sentry from "@sentry/nextjs";

const { logger } = Sentry;

logger.trace("Starting database connection", { database: "users" });
logger.debug(logger.fmt`Cache miss for user: ${userId}`);
logger.info("Updated profile", { profileId: 345 });
logger.warn("Rate limit reached for endpoint", {
  endpoint: "/api/results/",
  isEnterprise: false,
});
logger.error("Failed to process payment", {
  orderId: "order_123",
  amount: 99.99,
});
logger.fatal("Database connection pool exhausted", {
  database: "users",
  activeConnections: 100,
});
```

---

For questions or unclear conventions, check the main README or ask for clarification in your PR description.

