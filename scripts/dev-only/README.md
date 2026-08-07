# Dev-only scripts

**NOT FOR PRODUCTION OR SELF-HOST.**

These scripts fabricate channels, posts, members, workspaces, and billing
state against a local database so UI QA can photograph empty and filled
screens, or drive intentional SaaS ops against a non-customer database.
They are never wired into `package.json` install/postinstall hooks and must
not be run against a production or customer self-host database.

## Scripts

| Script | Purpose |
| --- | --- |
| `seed-dev-workspace.mjs` | Fill a local org with channels / posts / avatar |
| `seed-dev-channel.mjs` | Placeholder Mastodon channel(s) |
| `seed-dev-posts.mjs` | Sample QUEUE / DRAFT posts |
| `seed-dev-member.mjs` | Invite a `USER` team member |
| `seed-dev-org.mjs` | Second workspace for the same user |
| `dev-state.mjs` | Force tier / trial / lifetime combinations |
| `grant-lifetime.mjs` | Fabricate a lifetime entitlement (ops) |
| `stripe-test-drive.mjs` | Drive Stripe test checkout flows |
| `stripe-test-fixtures.mjs` | Create / revoke Stripe test price fixtures |

## Usage

```bash
node scripts/dev-only/seed-dev-workspace.mjs --email you@example.com
node scripts/dev-only/seed-dev-workspace.mjs --org <orgId>
node scripts/dev-only/dev-state.mjs --org <id> --show
node scripts/dev-only/grant-lifetime.mjs --org <id> --dry
```

Always prefer `--dry` first. Prefer `--revoke` / `--reset` over leaving seed
rows behind.
