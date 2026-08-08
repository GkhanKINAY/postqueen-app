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

Six checks, all against `docs/ui-migration-baseline/`:

| check | what it holds |
|---|---|
| `types` | both apps compile |
| `api` | the set of backend endpoints the frontend calls |
| `i18n` | the translation key set — none dropped, none invented |
| `routes` | the page list |
| `gates` | feature-gate call sites, counted (a gate falling from two to one is the half-removal this catches) |
| `loops` | indefinite animations with no way to switch off for `prefers-reduced-motion` — **empty by design**, any entry is a regression |

It runs in CI on every push (`.github/workflows/build.yml`), before the build. If a
change is *meant* to move a list, run `--update`, **commit the baseline**, and say
why here and in the PR. A baseline file that is absent rather than different fails
the check: an uncommitted one would reseed itself on every CI run and guard nothing.

## Log

**Autopost / Webhooks hardening pass.** Correctness work on the two features, not a
restyle — but it moved `i18n.txt`, so the reason belongs here.

`i18n.txt` gained **three** keys, all real new `t()` call sites: `n_shown` (the channel
picker's counter now says how many rows a search left, because "Select all" acts on
those and not on the full list), and `settings_update_failed` / `time_slots_required`
(the posting-times table checks the response instead of always toasting success, and
will not submit an empty slot list).

Five further keys were **already being called and existed in no locale at all**:
`no_channels_available_to_pick`, `no_pickable_channels`, `autopost_needs_channel`,
`webhook_needs_channel`, `something_went_wrong`. They are now written in all sixteen.
This is a blind spot worth knowing: `collect_i18n` scans `t()` call sites, not the
locale JSONs, so a key can sit in the baseline, pass the check, and still show English
to every non-English user. The check cannot see it; only a locale-side count can.

Note that the locale files are **not** in key parity with each other and never have
been (en 1067, tr 756, most 748, ka_ge 555) — en is the superset and the rest fall
back to it. That is a separate, pre-existing job.

Two Prisma migrations arrived with this pass: `20260808120000_autopost_auto_publish`
(per-rule choice between parking feed items in Drafts and publishing them) and
`20260808200000_post_release_id_index` (`Post.releaseId` had no index, and every
webhook delivery matches on it).

**Deploy order matters for this one.** `processCron` now starts `autoPostWorkflowV2`
with `TERMINATE_EXISTING`. Ship the orchestrator **before** the backend: the reverse
order terminates each rule's running v1 execution and replaces it with one whose type
the worker does not yet know, which then sits stuck.

**Loading-state pass.** Consolidated four "bone" greys onto one `--skeleton` token
behind `@gitroom/react/ui/skeleton`, and four spinner implementations onto
`@gitroom/react/ui/spinner`; reshaped page ghosts to mirror the markup they replace;
stopped a dozen surfaces from rendering their empty state — or, on Channels →
Automations, a live plug as "Off" — before their data arrived; and added the `loops`
check plus the CI step. Conventions are in `CLAUDE.md` under *Loading and empty
states*.

`loops.txt` is new, and empty. Two existing baselines shrank, both because the dead
`analytics/` subtree was deleted (`analytics.component`, `stars.and.forks`, `chart`,
`stars.table.component` — zero importers; the analytics route renders
`platform-analytics/` instead):

- `api.txt` lost `/analytics`, `/analytics/stars`, `/analytics/trending`.
- `i18n.txt` lost that subtree's eleven keys (`stars`, `forks`, `total_stars`,
  `stars_per_day`, `repository`, `processing_stars`, and so on). They are still
  present in the fifteen locale JSONs; only the call sites are gone.

`gates.txt` moved on two lines, and a gate count falling is exactly what that check
exists to question, so both reasons are here:

- **`tier.public_api` 4 → 0.** The `/connections` route no longer gates on
  `public_api && isGeneral && org admin`. That condition was inherited from the page
  this one replaced, and two thirds of it were wrong in the new place: `public_api`
  is false on FREE — every unsubscribed account — and `isGeneral` is the hosted-SaaS
  flag, false on every self-host, which is the audience most likely to want MCP.
  Between them they hid the catalog from the people the product tour walks straight
  to it. **No capability was un-gated**: what is genuinely paid and admin-only is the
  credential, and the server still enforces that on its own — `/user/self` returns an
  empty `publicApi` to members and `POST /api-key/rotate` stays policy-guarded. What
  members gained is the catalog, the install steps, and a line saying where the key
  comes from. Rationale is repeated above `ConnectPage` in
  `public-api/connect-panel.tsx`.
- **`tier.webhooks` 4 → 5.** Additive: `webhooks/webhooks.tsx` reads the tier's
  webhook allowance a second time to enforce the limit before the create call rather
  than only when painting the quota line.

## Known follow-ups

Real, unforced, and deliberately left out of the pass above:

- **Cold load of the calendar is two waves, not one.** `/integrations/list` and the
  `/posts` wave now overlap; `/user/self` still gates everything
  (`new-layout/layout.component.tsx`, `if (!user) return <LayoutSkeleton />`).
- **Four empty-state vocabularies**: the shared `ui/empty-state.tsx` on legacy
  tokens, the `ui/no-channels-art.tsx` trio on the new ones, and locally-defined
  `EmptyState` components in `platform-analytics/render.analytics.tsx` and
  `agents/agent.chat.tsx`.
- **`launches/helpers/use.sets.tsx`** has the non-ok hole that
  `use.integration.list.tsx` just closed, but its `'sets'` SWR key has a second
  fetcher in `launches/calendar.context.tsx`. Fix both together or neither.
- **`auth/testimonial.component.tsx`** has zero importers.
- **`pqRing`** (keyframe in `global.scss`, utility in `tailwind.config.cjs`) has zero
  consumers. Its comment calls it the tour's spotlight; the tour cuts that hole with
  four rects instead.
- The `loops` collector has three documented blind spots — two looping utilities on
  one element, `className` expressions containing `>`, and brace nesting deeper than
  two levels. All latent; see the comment above `collect_loops`.

## Self-hosting

Self-hosters cloning a fresh empty database do not need any tier-migration
step — new installs only use CREATOR / GROWTH / PRO / AGENCY.
