# apps/commands

NestJS CLI task runner (`nestjs-command`). **Not used for launch ops.**

## Why it does not boot

`CommandModule` imports `DatabaseModule` without a Temporal client, so
`NotificationService` cannot be injected. Separately, `tasks/agent.run.ts`
calls `AgentGraphService.createGraph`, which no longer exists — the graph
API moved and this command was never updated.

Fixing that is an architecture pass (Temporal wiring + agent API), not a
one-line patch. **Won't-fix for launch.**

## What to run instead

One-off data jobs live as scripts under `scripts/`, for example:

```bash
# After deploy has pushed the schema (CREATOR / GROWTH / AGENCY on the enum):
node scripts/migrate-tiers.mjs
```

See `docs/launch-ops.md` for the post-deploy checklist.
