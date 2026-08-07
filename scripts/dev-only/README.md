# Dev-only seed scripts

**NOT FOR PRODUCTION OR SELF-HOST.**

These scripts fabricate channels, posts, members, workspaces, and billing
state against a local database so UI QA can photograph empty and filled
screens. They are never wired into `package.json` install/postinstall hooks
and must not be run against a production or customer self-host database.

## Scripts

| Script | Purpose |
| --- | --- |
| `seed-dev-workspace.mjs` | Fill a local org with channels / posts / avatar |
| `seed-dev-channel.mjs` | Placeholder Mastodon channel(s) |
| `seed-dev-posts.mjs` | Sample QUEUE / DRAFT posts |
| `seed-dev-member.mjs` | Invite a `USER` team member |
| `seed-dev-org.mjs` | Second workspace for the same user |
| `dev-state.mjs` | Force tier / trial / lifetime combinations |

## Ops (kept outside this folder)

`scripts/grant-lifetime.mjs` stays at `scripts/` for intentional ops use. It
also carries a **NOT FOR PRODUCTION** header — it fabricates an entitlement
nobody paid for.

## Usage

```bash
node scripts/dev-only/seed-dev-workspace.mjs --email you@example.com
node scripts/dev-only/seed-dev-workspace.mjs --org <orgId>
node scripts/dev-only/dev-state.mjs --org <id> --show
```

Always prefer `--dry` first. Prefer `--revoke` / `--reset` over leaving seed
rows behind.
