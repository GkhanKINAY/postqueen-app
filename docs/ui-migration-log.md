# UI redesign notes

PostQueen’s frontend visual redesign uses a local handoff under
`design/handoff/` (gitignored — unreleased design material). If that folder is
missing from your checkout, ask the maintainers rather than guessing.

**How it looks** comes from the design. **How it works** (routing, APIs,
validation, feature gates, i18n) comes from this repository.

## Prove a restyle broke nothing

```bash
scripts/ui-migration-check.sh
```

Types, API-path list, i18n keys, and routes must match
`docs/ui-migration-baseline/`. If a change is *meant* to update one of those
lists, run `scripts/ui-migration-check.sh --update` and say so in the PR.

Self-hosters cloning a fresh empty database do not need any tier-migration
step — new installs only use CREATOR / GROWTH / PRO / AGENCY.
