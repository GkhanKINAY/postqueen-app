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

`gates.txt` moved on five lines, and a gate count falling is exactly what that check
exists to question, so every reason is here:

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

The last three moved with the deferred-items pass below, all in the same direction —
a pricing flag that nothing read becoming the thing that decides:

- **`tier.autoPost` 1 → 2, `tier.current` 18 → 16.** The one occurrence in the
  baseline was never a gate: it was the word `tier.autoPost` inside the comment above
  `settings.component.tsx`'s Auto Post row, which `collect_gates` counts because it
  reads comments on purpose. The two real call sites replace
  `tier.current !== 'FREE'` on the nav row and the tab body. That comment has been
  rewritten to stop naming the flag beside the code that uses it, which is the rule
  the collector asks for in its own header.
- **`tier.ai` 7 → 8.** One site, `useAiAvailable` in `layout/user.context.tsx`. Every
  `<CopilotKit>` mount and every Copilot consumer now reads that one answer instead of
  the bare `aiEnabled` env flag, so the provider and the components underneath it
  cannot disagree about whether Copilot is available.
- **`billingEnabled` 30 → 37.** Not seven new gates: it is the same rule written once,
  and the identifier appears seven times across `aiAvailable`'s signature and body,
  `useAiAvailable`, and the two provider call sites that pass it in.

## Deferred-items pass

The four items the launch-closing pass listed as *bilerek yapılmayacaklar*. Three are
here; **ESLint 8→9 is not** — it was landed separately because it moves `pnpm-lock.yaml`.

**The throttler answered 500 to anyone who asked.** `ThrottlerBehindProxyGuard` chose
routes with `url.includes(...)`, and Express `req.url` carries the query string, so
`POST /auth/login?x=/public/v1/posts` entered the throttler. That route has no
`AuthMiddleware`, `getTracker` read `.id` off an undefined `req.org`, and the answer was
a 500 — unauthenticated, repeatable, on any POST route. Matching moved to `req.path`
with `startsWith`, and the tracker falls back to the socket address when there is no
org. `permissions.guard.ts` had the identical `indexOf` bug and was fixed in the pass
above; this is the same fix in the other guard.

Second one on the same path: `ThrottlerStorageRedisService` calls `redis.call('eval')`,
and without `REDIS_URL` `ioRedis` is the `MockRedis` in `redis.service.ts`, which
implements `get`/`set`/`del` and nothing else. Every upload and every public-API post
threw on an install that had not set one. The storage is now only passed when there is
a real Redis; `@nestjs/throttler` falls back to its own per-process store, the same
trade `AbuseGuardService` already makes. **The set of throttled routes did not change**,
so nobody who works today starts seeing 429.

**Auto Post was gated by the webhook quota.** `POST /autopost` carried
`Sections.WEBHOOKS`, inherited from upstream, which counts webhook rows. It was wrong in
both directions: an org that had used its webhook allowance could not create an autopost
for an unrelated reason, and the `autoPost` pricing flag was read nowhere, so a tier
marked `false` had the feature anyway. There is now a real `Sections.AUTOPOST` on create
and update. Creator was given `autoPost: true` (owner, 2026-08-08) so the new gate takes
nothing from anyone paying today; retired STANDARD matches. `POST /:id/active` is
deliberately still open — switching a rule *off* must not require a subscription.

**`/copilot/chat` was the one AI route with no policy**, so a FREE org got a working
OpenAI runtime on our bill while `/copilot/agent`, `/copilot/list` and
`/copilot/:thread/list` all answered 402. Adding the policy alone was what the earlier
pass deferred, and rightly: CopilotKit speaks GraphQL through its own urql client, which
never reaches the `customFetch` wrapper that turns a 402 into the Payment Required
dialog, so the 402 surfaces as an unhandled `CombinedError`. The policy therefore lands
together with a tier condition on all three `<CopilotKit>` mounts and all six consumers,
through the single `useAiAvailable`. This also closes a live bug: `/copilot/agent`
always carried the policy, so on a billing-enabled install a FREE user opening `/agents`
already hit that error. `subscription.exception.ts` gained `AUTOPOST` and `AI` cases —
its `switch` has no `default`, so a section without one renders a blank dialog, which is
the bug the `ADMIN` case was added for.

## Known follow-ups

Real, unforced, and deliberately left out of the pass above:

- **A downgrade to FREE leaves autopost rows saying `active: true`.**
  `integration.service.ts`'s `changeActiveCron` terminates the Temporal workflows but
  never writes the column, so an org that lapses and re-subscribes sees its rules
  marked On with nothing running behind them. `AutopostService.stopAll` was written
  for exactly this and has never had a caller. Predates the autoPost gate and is
  unchanged by it.
- **`POST /autopost/:id/active` carries no policy.** Left open on purpose so that
  switching a rule off never needs a subscription, which leaves switching one *on*
  open too. Narrow today — it needs a rule that only a paid tier could have created,
  and a lapsed org cannot reach Settings — but it is the one autopost route a tier
  cannot refuse.
- **`Sections.VIDEOS_PER_MONTH` has no branch in `permissions.service.ts`.** `check()`
  is deny-by-default, so any route that names that section is refused outright. No
  route names it today.
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

## Config-off paths told the truth pass

A launch-readiness audit of the running v3.3.0 install. The theme is one bug
written six times: **a feature that is switched off at the installation level
was reported to the user as a plan problem, a loading state, or a success.**

`gates.txt` moves two lines and `i18n.txt` gains three keys:

- **`billingEnabled` 36 → 39.** Three new reads, all guards being added rather
  than removed: `billing.component.tsx`, `first.billing.component.tsx` and the
  corrected condition in `new.post.tsx`.
- **`tier.ai` 8 → 7.** `createAiPost` no longer decides on `user.tier.ai`
  directly; it asks `useAiAvailable()`, which is the single rule. The padlock
  (`aiLocked`) still reads the tier, because a padlock *is* a tier statement.
- **i18n** gains `ai_not_configured_body` (the key already existed in five
  locales and had never been called) plus `billing_not_configured_title` and
  `billing_not_configured`, written into `en`. The other locales fall back, as
  they do for the 300-odd keys already in that position — including
  `billing_admin_only`, the sibling string on the same screen, which lives only
  as an inline fallback.

**"AI post" told everyone to upgrade.** `new.post.tsx` gated on
`!billingEnabled || !user?.tier?.ai`. On an install with no Stripe keys the
first clause is always true, so every user got "You need to upgrade" and a push
to `/billing` — a page the nav hides and whose checkout cannot take money. The
same file had the correct form two hundred lines below in `aiLocked`. Now: no
OpenAI key gets a plain toast and no billing trip, and the upgrade dialog is
reserved for the one case where upgrading is genuinely the answer.

**Video generation demanded the end of a trial that did not exist.**
`media.service.ts` checked `!video.trial && org.isTrailing` with no
`isBillingEnabled()`. Every new organization is written `isTrailing: true` for
seven days regardless of billing, so the first week of every account on a
billing-off install was told to finish its trial and charge a card. The
correctly-guarded twin was already in `integration.service.ts`.

**Every non-US user hydrated a mismatch.** `date.format.tsx` refreshed its
snapshot at module load, which runs before React replays the server markup. The
server renders MDY + 12-hour (it cannot know the visitor's locale) and the
browser immediately answered DMY + 24-hour, so React discarded the server HTML
and repainted — a visible flash of wrong dates and times on anything with a
timestamp. The `useSyncExternalStore` plumbing was already correct; the pattern
builders were bypassing it. They read the snapshot now, and the module-load
refresh is gone. Safe because all seven files that call them also subscribe via
`useDateFormat()`.

**A failed `/sets` fetch read as "no sets".** Neither fetcher checked
`response.ok`, and `customFetch` resolves 4xx/5xx — so a server error parsed as
data, `setsError` never populated, and `resolveSets` (which was written
correctly) took the happy path. The composer skipped its Select-a-Set step
silently for people who have sets. Both fetchers were fixed together because
they share the `'sets'` SWR key and which one runs depends on mount order.

**`/billing` was a storefront that could not take money.** No `billingEnabled`
check on the page or on `POST /billing/subscribe`; the route is navigable even
though the nav hides it, and pressing Purchase reached Stripe with the
`sk_nothing` placeholder and returned 500. Both ends now say so plainly.

**A downgrade left autopost rules reading "On".** `changeActiveCron` terminated
the workflow and never wrote the row, so Settings drew a rule as active with
nothing behind it, and a later re-upgrade restarted nothing. It writes the row
now, and a Temporal failure is logged rather than swallowed by an empty `catch`.

**Three sections could still render a blank Payment Required dialog.**
`getErrorMessage` has a `default` arm at last. This bug has been found three
times — `ADMIN`, then `AI` and `AUTOPOST` — each fixed by adding one more case,
which left the next one waiting. `COMMUNITY_FEATURES`, `FEATURED` and
`IMPORT_FROM_CHANNELS` were the uncovered ones.

Two self-host traps closed while in the area. `hasProvider()` now also requires
`EMAIL_FROM_ADDRESS`/`EMAIL_FROM_NAME`, without which `sendEmail` returns early
while every caller believes mail works — with `REQUIRE_EMAIL_ACTIVATION=true`
that is a permanent lockout with no error anywhere. And `UploadFactory` refuses
`STORAGE_PROVIDER="local"` with no `UPLOAD_DIRECTORY` instead of writing to a
literal `./undefined/` directory that reads back as a 500; the frontend now
defaults to `local` the same way the backend always did.

`version.txt` is deleted. It said `v3.0.2`, nothing read it, and it sat beside
the `package.json` version that `d5550b7e` had just corrected to 3.3.0.

### Looked at and deliberately left alone

`autopost.service.ts`'s start-failure path also leaves a row `active: true`, and
the comment there argues — reasonably — that switching a rule off behind the
user's back on a transient Temporal blip is worse. That reasoning stands. The
real gap is that `processCron`'s return value is discarded by both callers, so
the API answers "saved" either way; surfacing it needs a response-shape change
and a frontend to match, which is its own change rather than a line in this one.

## Before the next release

Everything above this line is merged to `main` but **not released** — production is on
`v3.2.0`, which predates all of it. These are the things that have to be handled by
whoever cuts the next version. None of them is a code change; they are all rollout
order and environment.

**1. `Post_releaseId_idx` takes a write lock on the busiest table.**
`migrations/20260808200000_post_release_id_index/migration.sql` runs a plain
`CREATE INDEX` on `Post`. The comment in the file explains correctly why
`CONCURRENTLY` was not used — Prisma wraps a migration in a transaction and
`CONCURRENTLY` cannot run inside one — but that does not make the lock cheap: every
INSERT/UPDATE/DELETE on `Post` blocks for the length of the build. Run it by hand in a
quiet window first:

```sql
CREATE INDEX CONCURRENTLY IF NOT EXISTS "Post_releaseId_idx" ON "Post"("releaseId");
```

Then the deploy-time creation is a no-op. This applies on **both** schema paths — on the
default `db push` path Prisma emits the same non-concurrent statement from
`schema.prisma:449`.

**2. Confirm which schema path production actually uses.** `prisma-apply` runs
`db push --accept-data-loss` unless `PRISMA_MIGRATE` is truthy, in which case it runs
`migrate deploy`. If the answer is `migrate deploy`, check first:

```sql
SELECT migration_name, finished_at FROM _prisma_migrations ORDER BY finished_at;
```

There is no `migration_lock.toml` under `migrations/`, and until this pass `0_init` was
the only migration in the tree — both of which point at a database that was built with
`db push`. If `_prisma_migrations` does not contain `0_init`, `migrate deploy` will try
to replay 1,344 lines of `CREATE TABLE` against a populated database and fail on the
first `already exists`. `prisma migrate resolve --applied 0_init` is the fix, and it is
not something to discover mid-deploy.

**3. Deploy order — orchestrator first, then backend and frontend together.**

- *Orchestrator before backend.* `autopost.service.ts` now starts `autoPostWorkflowV2`
  with `TERMINATE_EXISTING`. If the backend goes first, the next time anyone saves or
  toggles a rule, that rule's running v1 execution is terminated and replaced with a
  workflow type the old worker has never heard of; the workflow task then fails and
  retries forever. It recovers on its own once the orchestrator ships, and only rules a
  user actually touches are affected — but the terminated v1 history does not come back.
  `autoPostWorkflow` (v1) is still exported from `workflows/index.ts` purely so existing
  executions can replay; do not remove it.
- *Backend and frontend together, in both directions.* Backend-first gives every FREE
  org an unhandled CopilotKit error, because `/copilot/chat` starts answering 402 and
  CopilotKit's urql client never reaches the wrapper that turns a 402 into the Payment
  Required dialog. Frontend-first is fine for Copilot but breaks the posting-times
  table, whose empty-list rejection (`@ArrayNotEmpty`) needs the new frontend to avoid
  reporting a false success. Simultaneous is the only clean answer.
- If production runs the single `Dockerfile.dev` image, `pnpm run --parallel pm2` starts
  backend and orchestrator from one artifact and the ordering question does not arise.
  It only matters if they are separate deployables.

**4. Environment, checked before the deploy rather than after.**

- **`REDIS_URL`** must be set. The throttler now only uses Redis storage when it is,
  and falls back to a per-process counter otherwise — with N backend instances the
  effective limit becomes N × `API_LIMIT`.
- **`SUPPORT_EMAIL`** defaults to `support@postqueen.ai`. Help → Contact support and
  Help → Report a bug always render, so if this is unset your users' bug reports come
  to us.
- **`TRANSLOADIT_TEMPLATE`** is read by all three frontend layouts and appears nowhere
  in `.env.example`. If Transloadit uploads are meant to work, it has to be set, and
  the example file should gain it.
- The video providers evaluate their keys **at import time** (`veo3.ts`,
  `images.slides.ts`), so adding `KIEAI_API_KEY` or the Image-Text-Slides set needs a
  backend restart, not a config reload. Image Text Slides is all-or-nothing across
  `ELEVENSLABS_API_KEY` + `TRANSLOADIT_AUTH` + `TRANSLOADIT_SECRET` + `OPENAI_API_KEY` +
  `FAL_KEY`.

**5. Tell webhook customers their payload changed.** `getPostByForWebhookId` now matches
on organization + integration + `releaseId`, so deliveries that used to arrive with an
empty array now carry real post data. Receivers written against the empty array may
choke on it.

**6. CI still does not run.** Every Actions run in this repository's history is a
`workflow_dispatch`; `event=push` and `event=pull_request` are both zero, and merging
PR #19 into `main` produced no run either. The `Build` workflow — which is what would
execute `scripts/ui-migration-check.sh` — has never once executed. The repository is a
fork, and forks need the button on the Actions tab before automatic triggers fire.
Until somebody presses it, **local verification is the only gate**, and the CI step
added to `build.yml` is documentation rather than enforcement.

## Self-hosting

Self-hosters cloning a fresh empty database do not need any tier-migration
step — new installs only use CREATOR / GROWTH / PRO / AGENCY.
