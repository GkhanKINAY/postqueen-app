# apps/commands

NestJS CLI task runner (`nestjs-command`).

## Why it does not boot

`CommandModule` imports `DatabaseModule` without a Temporal client, so
`NotificationService` cannot be injected. Separately, `tasks/agent.run.ts`
calls `AgentGraphService.createGraph`, which no longer exists — the graph
API moved and this command was never updated.

Fixing that is an architecture pass (Temporal wiring + agent API), not a
one-line patch.

## Dev / ops scripts

One-off local and SaaS ops helpers live under `scripts/dev-only/` (see that
folder’s README). They are **not** for production or self-host installs.

After merging from upstream (`gitroomhq/postiz-app`), re-run `scripts/rebrand.sh`
to restore PostQueen branding. That script is intentional fork tooling — not
residue.
