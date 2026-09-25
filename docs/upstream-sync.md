# Taking commits from upstream

PostQueen is a fork of [`gitroomhq/postiz-app`](https://github.com/gitroomhq/postiz-app).
Upstream keeps fixing things we still have, so we keep taking their work — but the
frontend here is a full redesign and the two trees have diverged far enough that
"merge upstream/main" is not an option.

This is how the sync is done, written after the first full one so the next is
cheaper.

## What the divergence actually looks like

Measured at the August 2026 sync, fork point `c90b6c62`:

| | |
|---|---|
| Upstream commits since the fork | 42 |
| Ours | 335 |
| Files upstream touched | 78 |
| Of those, files we had also touched | 68 |

That 87% overlap sounds fatal and is not. Our changes to the provider files are
**one or two lines each** — a `category` and a `trialLocked` property — so most
"conflicts" are a two-line resolution. The real work concentrates in three
places: the frontend components we rewrote, `post.activity.ts`, and anything
that collides on a filename.

## Rules

**Cherry-pick in date order, never by theme.** This is the one that cost the most
to learn. These commits form a dependency chain: the pending-post contract is
commit 12 of 42 and later commits patch the methods it introduces. Batching by
theme pulled commits past their own foundations and collided three separate
times. After switching to chronological order, one run landed ten of eleven
commits with no conflict at all.

Group *consecutive* runs into a PR. Do not group by subject matter.

**Always check for a workflow filename collision.** Upstream wrote a
`post.workflow.v1.0.6.ts` exporting `postWorkflowV106` — so had we, for a
different fix, 386 lines apart. A workflow replays against the code it started
with, so overwriting one that is running breaks every post in flight with a
non-determinism error. Theirs became our v1.0.7; ours was left byte-identical.
Check this before every sync, not just when something looks suspicious.

**Take their structure, keep our improvement.** Almost every conflict in the
first sync had this shape. Worked examples:

- `postSocial` split into `postSocialInternal` — took the split, kept
  `isBillingEnabled()` over their bare `STRIPE_SECRET_KEY` check.
- `sendWebhooks` — took their outer try, kept our three-argument scoped payload
  and abort timeout.
- Impersonation dropdown — took their sizing, kept `border-pqLine` over their
  deprecated `border-customColor6`.

**Never copy deprecated tokens or their branding.** `text-customColor*` is on
this repo's deprecated list, and hex literals do not belong in components.
Upstream markup also carries `docs.postiz.com` links and Postiz product names.

**Check whether we already fixed it, and better.** Several upstream commits
duplicated work we had done. Sometimes theirs superseded ours (their duplicate-
post guard sets `posted` before `updatePost`, covering a case ours did not, so
ours was dropped rather than layered on). Sometimes ours was better and theirs
was dropped — our `fail()` helper on AI video stays quiet when the user
dismissed the billing dialog and is translated; upstream's replacement is a
hardcoded English toast.

**Merge translation key sets, do not choose a side.** And take only the keys
belonging to the commit being picked: upstream's side of a conflict carries keys
from commits not yet picked, which would otherwise scatter dead strings for
unbuilt features across sixteen locales.

**Some commits are theirs, not ours.** `48bf76af` points the security policy at
`postiz.gadvisory.org`, upstream's own advisory intake. Taking it would send
anyone reporting a vulnerability in our product to a different company.

## Verification, per PR

```
scripts/ui-migration-check.sh   # in a throwaway worktree
pnpm run lint
```

Baselines move on a feature addition, and that is fine when it is **additions
only** — the shape to be suspicious of is a removal. Run `--update`, commit the
baseline, and say why in `docs/ui-migration-log.md`.

Typecheck all three apps. Upstream's own tree is not always clean against ours:
`e287a14d` arrived with three `@ts-ignore` comments that suppress the *next
line*, and two of those expressions wrap, so the error landed on the
continuation line and the backend would not compile.

## August 2026: what happened

**41 of 42 taken, 1 skipped.** Seven PRs, #38 through #44, released as v3.4.0.
Every taken commit carries its upstream hash in the message; `48bf76af` is the
only one not present, for the reason above.

Highlights worth remembering: provider uploads no longer buffer whole videos
into a container capped at 4 GB; the pending-post contract landed as v1.0.7; SSRF
protection reaches the axios paths; publishing an already-published post now
needs an explicit opt-in.

## September 2026: what happened

**79 commits past the watermark: 53 taken, 8 already here or empty once
adapted, 18 skipped.** Six PRs: #60, #61, #62, #64, #65 and the one that moved
this watermark (#63 was a Next.js security hotfix raised during the sync).
Every taken commit carries its upstream hash in the message.

**Post workflow numbers now lag upstream's.** Our v1.0.7 is upstream's v1.0.6
(the August collision above). Upstream then wrote v1.0.7 through v1.1.2 in a
month. None of the intermediate ones ever ran here, and a workflow file on
`main` can never change again, so none was taken: each commit that introduced
one came in without the file, its export and its start-name bumps (three of
them were nothing else, and are logged as empty). The final one, upstream's
v1.1.2, is our **v1.0.8**: the same file with three lines changed, the
generated Prisma import, the function name and the `startChild` that re-queues
a repeat post.

**Our v1.0.9 is ours, not upstream's** (September, after this sync): v1.0.8
plus a claim on the post before it is published (`claimPost`, `Post.publishClaim`),
a failed comment marking the comment instead of the root post, no "Already
posted" error on a run that finds the post already published, and a single
failure for a channel whose setup was never finished. So upstream's next post
workflow becomes our **v1.1.0**, not v1.0.9: take only the newest, adapt the
three lines above, carry v1.0.9's changes into it (the header comment of
`post.workflow.v1.0.9.ts` lists them), and move both call sites
(`posts.service.ts`, and the missed-posts sweep in `post.activity.ts`).

Lessons, in the order they cost time:

- **A local typecheck can pass on an import that does not exist.** Upstream
  still imports `@prisma/client`; this fork generates its client into
  `database/prisma/generated`. A stale `@prisma/client` left in node_modules
  kept `tsc` quiet, and CI, installing clean, failed. Grep every batch for
  `from '@prisma/client'` before pushing.
- **Schema changes need a migration here; upstream ships none.**
  `PRISMA_MIGRATE=true` installs only apply `migrations/`. Generate each one
  from the app root (the Prisma config is read from the working directory):
  `pnpm exec prisma migrate diff --from-schema <previous> --to-schema <current> --script`.
  It catches what a hand-written one misses: making a relation optional turns
  its foreign key from ON DELETE RESTRICT into SET NULL.
- **Upstream lands some commits twice**, through two branches. Same patch-id,
  different hash; the second is logged as a duplicate, not taken twice.
- **Upstream's hosted service shows up in their diffs**:
  `claude.ai/directory/postiz`, `mcp.postiz.com`, their ChatGPT app listing,
  `docs.postiz.com`. Taking them sends our users to their product.
- **A fix of ours can be undone by a refactor of theirs.** When upstream moves
  code into a new method (`validateVideoRequest`, the billing provider switch),
  the check we had hardened in the old place arrives in its original form in
  the new one. Resolving the conflict is not enough; re-apply the hardening.

## September 2026 (second sync): what happened

**64 commits past the watermark (`c9382d98..6f107801`): 31 taken, 5 already
here or empty, 10 skipped, 18 left for an owner decision.** One branch,
`sync/upstream-2026-09`, picked in `git log --reverse` order. Every taken
commit carries its upstream hash; the ones that needed more than a conflict
resolution say how in an "Adapted for this fork" paragraph. Commits of our
own follow the picks: one carries an upstream fix into code only this fork
has (Facebook per-post video statistics), and the rest answer a review of the
picked code. The review found upstream's signer throttle keyed on a header
the client writes, so it could be bypassed; a closed Farcaster approval view
that kept polling and later closed whatever modal was open; a Threads preview
still cropping by characters; and mixed forms of address in German and
Spanish.

Measured first, because it was asked: a trial `git merge-tree` of
`upstream/main` into `main` conflicts in 145 files, and would also have added
upstream's `post.workflow.v1.1.2.ts` next to our identical v1.0.8 and reopened
every skip below. Cherry-picking stays the method.

What landed: the three the owner asked for (LinkedIn Page connect no longer
takes over the personal LinkedIn channel, `03bea3de`; Pinterest per-Pin
statistics read `summary_metrics`, `8f92a37e`; Farcaster login and connect
through Neynar managed signers, `2c2f788e` and four follow-ups), plus Facebook
video/reel analytics, curated `(#200)` messages on Facebook and Instagram, a
reconnect flag for Facebook channels holding a user token, TikTok's image-size
check, Reddit's post type and subreddit names, Bluesky disconnecting only on a
4xx, Threads counted in UTF-8 bytes, Instagram collaborators on the carousel
container, email claims for DCR clients on verified domains,
`client_secret_basic` on the token endpoint, Sentry sampling, admin stats per
creation source, the Change Bot Picture picker and custom-fields reconnect.

Lessons, in the order they cost time:

- **A fix can target code the redesign removed.** `ed721b4f` fixes the
  launches channel menu, which this fork no longer renders. The same bug lived
  in the Channels page's reconnect, so that is where it went. Most other
  surfaces already send a reconnect to that page through
  `useOpenReconnectInChannels`; three refresh-URL factories remain
  (`agents/agent.tsx`, `platform-analytics/platform.analytics.tsx`,
  `platform-analytics/render.analytics.tsx`) and would pick the fix up by
  switching to that hook.
- **Read a picked guard as if it were ours.** `889f87f4`'s throttle trusted
  the first `X-Forwarded-For` entry, which our own
  `ThrottlerBehindProxyGuard` comment already warns against; our nginx
  appends to that header, so the last entry is the only one a client cannot
  write.
- **This fork has some paths twice.** Pinterest and Facebook each have
  upstream's single-post `postAnalytics` and our per-post `postsAnalytics`
  (the statistics tables). Both upstream fixes touched only the first, so both
  were carried into the second: inside the `8f92a37e` pick, and as a follow-up
  commit for Facebook.
- **Upstream's translation tool back-fills unrelated keys** into every locale
  of whatever commit it runs on. `2c2f788e` carried the onboarding strings of
  the modal skipped last time, and `"apple": "Elma"` (the fruit) in Turkish.
  Take only the picked commit's keys, and check the Turkish register.
- **A dependency change needs a real install to verify.** The sync worktree's
  `node_modules` was a symlink into the main checkout; it was replaced by a
  local `pnpm install`, so `qrcode` could be added and the lockfile
  regenerated without touching the main checkout, and so `tsc` saw what CI
  sees.

## September 2026 (third sync): what happened

**The 18 left for an owner decision, plus 21 new commits (`6f107801..8b84b0dc`).**
The owner's word on the 18 was to take everything that can be taken without
breaking the app, and the clipping port above followed from it. Of the 18:
16 taken (the eight superadmin commits as one adapted commit without their
cross-tenant header, and the Mastra mirror measured rather than copied), 2
left out because they only serve that header. Of the 21: 11 taken, 5 already
here, 5 skipped.
The second sync's branches, the five fix branches of the same day
(`fix/mcp-oauth-discovery`, `fix/hashnode-endpoint`, `fix/platform-limit-validation`,
`fix/connect-guides`, `chore/remove-medium`) and all of this landed together.

What landed from the 18: URL uploads that stream to a temp file instead of
buffering the body (`118d89c0`, onto our spooled upload path); the MCP OAuth
issuer split with `/mcp-oauth-chatgpt` (`2a0d6885`, `48490b81`, on the
base-path fix so `/api` survives); Mastra 1.67 and CopilotKit 1.72
(`c589175a`); the MCP upload widget (`2c29ea3e`, `c6bfe135`, `1251b5a0`, on
`spooledFileInterceptor` and `CustomFileValidationPipe`, so the allow-list and
the video normalizer apply to it); and the superadmin debug endpoints
(`facc77d8` and seven follow-ups), for the calling organization only.

From the 21: Facebook page analytics throws on a Graph error instead of
caching an empty result, Facebook reels get statistics, Google Business posts
link to Google's `searchUrl`, Slack's `ok: false` answers fail the post
instead of marking it published, Reddit resolves a pasted `r/name` or URL,
Sentry stops tracing MCP stream GETs and samples at 0.1, clipping asks for
the fit before it starts and gets public API endpoints, and a multipart
`.mov` or `.mp4` is accepted in either ISO brand.

Lessons, in the order they cost time:

- **Measure the Mastra mirror; do not copy upstream's.** Upstream mirrored its
  own production database, which carries tables, types and index names from
  Mastra versions this fork's tables were never created with (`mastra_threads.metadata`
  is text here, not jsonb). The mirror in `schema.prisma` is now what
  `migrate deploy` plus Mastra's own `PostgresStore.init()` produce on an
  empty database, read back with `prisma db pull`. Do the same after every
  `@mastra/*` upgrade: `prisma migrate diff` from that database to the
  schema must list nothing for `mastra_*`, and from the previous schema to
  the new one it must contain no DROP of a column that holds data.
- **Prisma 7 refuses `db push --accept-data-loss` from an agent** without the
  user's consent text. Do not work around it. `migrate deploy` onto a scratch
  database is the production path anyway, and `migrate diff` reads, it
  never writes.
- **The same diff found six columns no migration adds** (`Post.publishClaim`,
  `Integration.autoDisabledAt`, `Organization.subscriptionEndedAt`, three
  subscription tiers). They date from before production moved to
  `PRISMA_MIGRATE`. `20260922120000_db_push_catch_up` adds them with
  `IF NOT EXISTS`, which changes nothing where they exist.
- **Our `ULTIMATE` is not upstream's.** Since
  `20260924120000_rename_agency_to_ultimate` the top plan (formerly `AGENCY`)
  is keyed `ULTIMATE`, and upstream's own `ULTIMATE` tier ($99 / $950, 100
  channels) is our retired `LEGACY_ULTIMATE`. An upstream hunk that touches
  `ULTIMATE` in `pricing.ts`, the `SubscriptionTier` enum or the RevenueCat
  parser means `LEGACY_ULTIMATE` here and has to be merged by hand. `AGENCY`
  is still accepted as input through `TIER_ALIASES`.
- **Upstream's CVE fixes can arrive after ours.** CVE-2026-94455 and -94456
  were both closed here earlier and more strictly (a separate
  `ENTERPRISE_SECRET`; a CSPRNG behind `makeId` itself rather than a second
  function every caller has to remember).
- **Read a support tool as an attack surface.** `x-postiz-org` makes a
  superuser organization's API key a key to every tenant, and this fork puts
  that key in the `/mcp/<key>` URL people paste into AI clients. The
  endpoints came in for the calling organization only; impersonation in the
  web app, session based and superuser only, stays the way to look into a
  customer's workspace.

## September 2026 (fourth sync): what happened

**42 commits past the watermark (`5ff9e0b2..374fb202`, merges not counted):
38 taken, 1 already here, 3 skipped.** The first run since `main` records
upstream as merged, so `main..upstream/main` listed exactly these. Five PRs:
the fixes (#261), the preview comments on their own because they carry a
schema change and a restyle (#262), three commits upstream merged while
those were in review (#263), the `-s ours` merge (#264), and the preview
opened before publishing with the MCP preview link that needs it (#265).

What landed: platform errors mapped to readable reasons or the right outcome
(Instagram checkpoints and container errors, five Facebook Graph rejections
and a page without a page token, six X rejections plus Unauthorized media
uploads, Threads container retries, Reddit RATELIMIT resubmits, Pinterest
board ids, Lemmy, VK, Telegram and Dribbble); tag deletion cleaning up its
post assignments; a deleted post group answering 404; the uploader not
calling `clear()` mid-upload; three third-party errors kept away from
Sentry's report dialog; connected OAuth clients in the admin stats;
upstream's inline comments on `/p/:id`; and, from the late three, a checkout
that says so when Stripe.js is blocked, Instagram's 2207085 video error, and
the activation page no longer reading a response it is navigating away from.

Lessons, in the order they cost time:

- **Upstream's preview is a review step before publishing.** `f95bd486`
  (2026-08-09) had limited `/p/:id` to published posts and stopped it naming
  the owning organization. The comments first came in published-only to
  match, and `8c63e686` (the MCP schedule tool handing out `/p/<id>` for a
  post just scheduled) was skipped for it. The owner then chose upstream's
  way (2026-09-25, #265): every state is shown again, the Preview button is
  back on every post, and `8c63e686` is taken. What stays from `f95bd486` is
  the field picking: the page is still not told the owning organization, so
  a signed-in viewer's `canResolve` comes from `GET /posts/:id/comments`. An
  unpublished post's page asks crawlers not to index it.
- **Upstream keyed a new public rate limit on the first X-Forwarded-For entry
  again**, this time inside the global guard. The second sync's lesson
  applies unchanged: `ThrottlerRealIpGuard` on the route, global guard left
  alone.
- **Upstream brought its own captcha (Google reCAPTCHA); this fork already
  has one.** Anonymous comments use the Turnstile check of the passwordless
  login instead: a `preview_comment` action in `AbuseGuardService`, on by
  default once `TURNSTILE_SECRET` is set, and `TurnstileWidget` in the name
  dialog. No new env, no Google script on the page. Look for an existing
  mechanism before taking a second one along with a feature.
- **`/p/:id` has no `ViewportProvider`**, so `useViewport().touch` is always
  false there and the comments pane is inline at every width. Mobile
  behaviour on that page cannot hang off the viewport context.
- **The migration check's api list only sees `fetch()` of a literal path.**
  A path chosen by a ternary or held in a variable drops out of the list
  and reads as a removed endpoint. Write each call as its own literal.
- **Upstream keeps merging while a sync is in review.** Three commits landed
  after the watermark had been picked. Check `main..upstream/main` again
  right before the `-s ours` merge, and merge an exact hash, so what is
  recorded as handled is only what was.
- **Never take upstream's `@RealIP()`.** It reads the first X-Forwarded-For
  entry, which the client writes. Production is two proxies deep (host nginx,
  then the container's nginx behind the Docker gateway), so this fork sets
  Express `trust proxy` to private hops only and reads the client with
  `ClientIp` (`libraries/nestjs-libraries/src/user/client.ip.ts`). ESLint
  refuses `nestjs-real-ip`, so a synced commit that brings it back fails CI.
  The package itself is no longer installed; if a synced `package.json`
  change lists it again, drop the line.
- **Keep this fork's Sentry settings when upstream touches the
  `initialize.sentry*` files, `sentry.server.config.ts` or `global-error.tsx`.**
  Here there is no Session Replay (upstream's was unmasked), no crash-report
  dialog, `sendDefaultPii` is off, the OpenAI integration records no prompts
  or answers, the http integration keeps no request bodies, and only warn and
  error console lines are sent, as logs and as breadcrumbs. Every event,
  transaction, log and feedback also goes through `scrubForSentry`
  (`libraries/helpers/src/utils/sentry.scrub.ts`): even with
  `sendDefaultPii` off the SDK copies full URLs, cookies, request headers and
  sign-in bodies, which put provider access tokens, the `auth` session token,
  passwords and visitors' IPs in Sentry. The privacy policy on postqueen.ai
  describes what is left; loosening any of it needs the policy changed first.
- **Copy an upstream hash with `git rev-parse`, never by eye.** Two
  "(cherry picked / adapted from commit ...)" lines in this run first went in
  with a mistyped full hash; `git merge-base --is-ancestor <hash> upstream/main`
  over every such line caught them.

## Where the sync currently stands

**Synced through `374fb202` (2026-09-25), and merged.** Everything upstream had
written by that commit is either in this tree or listed below with a reason,
and `main` has that commit as an ancestor through a `-s ours` merge (see
"Next time"). The previous watermarks were `60431b08` (the same day, before
three late commits), `5ff9e0b2` (2026-09-22, the first one merged that way),
`8b84b0dc` (the same day, before three README commits), `6f107801`
(2026-09-19) and `c9382d98` (2026-09-03).

Skipped, deliberately:

| Upstream | Why |
|---|---|
| `48bf76af` | Points the security policy at upstream's own advisory intake |
| `3686d8ab` | Reflows two Bluesky expressions onto single lines so a `@ts-ignore` lands on the right one. We had already fixed the same error by narrowing the union once, which needs no suppression at all |
| `0b6dc6c5` | `GET /public/v1/users` returns id, name and email for any user by substring, behind a guard that only asks whether the calling organization has a superadmin *member*. A customer workspace our admin joined could enumerate every email address |
| `d26c68dc` `74b01ada` | An "Add to Claude" button linking to upstream's own Claude directory listing |
| `4f296fc0` `c9382d98` | Rework the onboarding modal this fork's redesign removed (agent setup lives under Connections), on upstream's hosted links and deprecated tokens |
| `bade093d` `40c869b5` `04a157ab` `d2a7b50a` `a1b94565` | Upstream's contributor process: their PR template and their CLAUDE.md QA rules |
| `d45c1c62` `59448d3b` `2db51c7f` `3c4cc6d7` `9c014364` `7e86a129` `b8427ba3` `ec162d2a` | Upstream's staging CI |
| `e2d5b9c5` `914b29f0` `b3cace23` | RunPod media processing. This fork runs its own ffmpeg normalization (see Media below) |
| `07fd99ef` `ee3eaa60` | Upstream's staging CI |
| `6b40c644` `1207941b` | A boot-time Mastra storage init and its revert; net zero |
| `facc77d8` (in part) `9485ca50` `c3e06973` | The `x-postiz-org` override, `x-postiz-include-deleted`, and the search-term rule of the `GET /public/v1/users` search from `0b6dc6c5`. Together they let one organization's API key act as any other; the debug endpoints of the same set were taken for the calling organization |
| `7cef69c1` | Widens the scope of upstream's own security advisory intake |
| `3d3e9eee` `6af357dd` `c0238437` | Upstream's ChatGPT app-directory listing (`chatgpt-app-submission.json`) |
| `8b84b0dc` | Reworks the onboarding modal this fork removed, around upstream's Claude, ChatGPT, Cursor and Grok Bot directory listings |
| `87ac77c6` `c33f2188` `5ff9e0b2` | Upstream's own README and the agent icons it shows. This fork's README is PostQueen's |
| `305f7c0d` `38cb6a41` `b90fc691` | Upstream's own README: their cloud versus open-source section and compliance line |

Already here, or empty once picked (second sync):

| Upstream | Here as |
|---|---|
| `3e6206f7` | Our post workflow v1.0.8 (`9226fd61`) |
| `b1930421` | `ca06a35c` already resolves the webhook's post by `releaseId`, and scopes it to the organization and integration, which upstream's version does not |
| `26885010` | Mantine 9 (`f57dfe81`) removed the React 19 warning this worked around |
| `b267fbeb` | `e3b4dc27` already hid the third-party support widget while Create Post was open; the widget has since been removed from this fork |
| `d46c7bb7` | Lockfile specifiers; empty after this sync's lockfile regeneration |
| `12978bef` `0ffdbc97` | `9d7f9e3e` moved Hashnode to gql-beta with the new tag and cover inputs, and also tells a bad token (RefreshToken) from a missing Pro plan and a missing post |
| `678acd4a` | `0901595b` already refuses a video on Slack at validation |
| `9259cf24` (CVE-2026-94455) | `f95bd486` puts the enterprise routes behind their own `ENTERPRISE_SECRET`, so a session token is unusable there, not only rejected |
| `4c835138` (CVE-2026-94456) | `22fae01e` made `makeId` itself a CSPRNG, which covers every caller, the frontend and the workflows included |
| `f9e0d010` (fourth sync) | `4d46754e` already signs Nostr events with the key's bytes |

Also left out of commits that were otherwise taken: `chatgpt-app-submission.json`
(`61cc2d47`, `50b171e6`, `88332766`), upstream's ChatGPT app-directory listing
for their hosted service.

**Media is a permanent divergence (2026-09-18).** This fork has no Transloadit:
no `transloadit` / `@uppy/transloadit` package, no `TRANSLOADIT_*` env, no
`transloadit` strategy in `uppy.upload.ts`, no `POST /media/save-media`, and
the Image Text Slides generator assembles its video with the ffmpeg on the
image (`libraries/nestjs-libraries/src/media/ffmpeg.service.ts`). Upstream kept
Transloadit and on 2026-09-16 (`e2d5b9c5`, `914b29f0`, `b3cace23`, `118d89c0`)
added a paid RunPod service that normalizes uploaded video. We take the shape
of that work (`processMediaWorkflow({ mediaId })`, `media_<id>` workflow ids,
`Media.status` / `processingError`, `GET /media/:id/status`, the Uppy
`WaitForMediaProcessing` plugin, the repository method names) but run ffmpeg in
our own container on a `media` task queue. So: skip any upstream commit that
touches the Transloadit assembly in `images.slides.ts`, `media.processor.interface.ts`,
`runpod*`, `createProcessor`, `RUNPOD_*` env or the uploader image; map a change
to their `checkProcessing` onto `normalizeMedia`; and take their `Media` status
and route changes only where the names already match ours.

**Medium is gone from this fork (2026-09-19).** Medium's API is archived and it
issues no new integration tokens, so the channel was removed whole:
`medium.provider.ts`, `medium.settings.dto.ts`, the composer's `medium/` folder,
its guide, icons and i18n keys. Upstream still has it, so a commit of theirs
that touches any of those files is a modify/delete conflict: drop it, do not
restore the provider.

**Clipping is taken without its processor (2026-09-19; `fc14ff16` and
`dac36eda` on 2026-09-22).** `9aad99cd`, `f5d83b19` and `c7405ff9` (YouTube video to captioned vertical
clips in the media library and as draft posts) were skipped by the second
sync and then taken on the owner's word, each with its upstream hash and an
"Adapted for this fork" paragraph. Upstream runs the jobs on RunPod
(`postiz-uploader`: Oxylabs fetches from YouTube, a GPU renders) and polls
them from the workflow. The owner has not yet chosen between that and yt-dlp +
ffmpeg in our own container, so what landed is everything that does not
depend on the choice:

- `Clipping` / `ClippingClip` (migration `20260919120000_clipping`, two new
  tables, nothing altered), the `clipping_minutes` credit type metered by
  `creditWindow`, `chargeCredits` / `refundCredits`, `/clipping` and
  `/clipping-widget/status`, `POST` / `GET /public/v1/clipping`, the three
  MCP tools under upstream's names, the
  `ui://postqueen/clipping` widget, and the plan-card line.
- The processor sits behind `IClippingProcessor` (`upload/clipping.processor.interface.ts`):
  `ingest` and `clip` each run one job of upstream's schema/v1 contract to
  its end, reporting progress for the heartbeat. `UploadFactory.createClippingProcessor()`
  picks it by `CLIPPING_PROCESSOR`; the only implementation today,
  `UnconfiguredClippingProcessor`, fails with "Clipping is not configured".
  `isClippingEnabled()` (`helpers/utils/clipping.enabled.ts`) is false until
  its `clippingProcessors` list names an implemented processor, and also
  needs cloudflare storage, `OPENAI_API_KEY` and `DEEPGRAM_API_KEY`. While
  it is false the tools and the widget are not registered, `POST /clipping`
  answers 503 and the plan cards leave the minutes out.
- `clipping.workflow.ts` is ours, not upstream's. It calls `analyseClipping`,
  `fetchClip` and `renderClip` on a new `clipping` task queue
  (`CLIPPING_CONCURRENCY`, default 1), each handing one job to the processor
  and heartbeating until it ends, the way `normalizeMedia` runs on `media`.
  Whichever processor is chosen, the workflow does not change. Running a
  job inside one activity means an analysis can be retried after it
  charged, so each attempt gives its own charge back first (a fix of ours
  after the picks); upstream's poll never ran past its charge.
- Plan minutes are `CLIPPING_MINUTES_PROPOSAL` in `pricing.ts`, upstream's
  60 / 120 / 300 / 600 put on Creator / Growth / Pro / Ultimate. They are a
  proposal until the owner sets them.

Left for the processor: one class implementing `IClippingProcessor`, its
case in `createClippingProcessor`, its name in `clippingProcessors`, its
env in `.env.example`, and for the self-hosted option yt-dlp on the image.
Upstream's worker cannot simply be reused: `gitroomhq/postiz-uploader` is
public but carries no licence.

Two things to settle before a processor switches it on, both found by the
review of the port and harmless while it is off:

- `STALE_HOURS` in `clipping.service.ts` is 4, while one clipping can run
  three activities of up to 3 h each on a queue of concurrency 1. A reaped
  clipping is refunded and dropped from the running count but its workflow
  is not cancelled, so it can still complete for free and let `MAX_RUNNING`
  be exceeded. Make the window longer than the worst case, or cancel the
  workflow when the reaper fires.
- The in-app agent would get `clippingStatusTool`, which polls for up to
  25 s; the MCP hosts are what it was written for.

For later syncs: upstream changes to their clipping workflow, to
`submit*` / `check*` in `clipping.service.ts`, to `runpod.media.processor.ts`
or to `RUNPOD_*` env are mapped, not picked. `submitClippingAnalyse` and
`checkClippingAnalyse` are our `analyse`, `submitClipFetch` / `checkClipFetch`
our `fetchClip`, `submitClipRender` / `checkClipRender` our `renderClip`.
Changes to the repository, the tools, the widget and the rest of the service
apply as they are, with `@prisma/client` rewritten and `postiz` in the widget
URI kept as `postqueen`.

Move the watermark every time a sync PR merges. It is the only cheap way to
answer "are we current?" — see the trap below.

## Next time

**`main` records upstream as merged.** Until 2026-09-22 nothing in `main`'s
history said upstream's commits had been dealt with, so GitHub counted every
one of them as "behind" forever, and `main..upstream/main` listed commits
taken months ago under their cherry-picked hashes. After the third sync,
upstream's `5ff9e0b2` was merged into `main` with `git merge -s ours`: a merge
commit whose tree is `main`'s own, unchanged, whose second parent says "all of
this is handled". From that point on `main..upstream/main` is the true list of
what upstream wrote since, and GitHub's count agrees with it.

So a sync is now:

```bash
git fetch upstream
git log --reverse --no-merges --format='%ad %h %s' --date=short main..upstream/main
```

1. Take, adapt or skip each commit as the rules above say, on branches off
   `main`, in date order, and record the decisions below.
2. When those have merged, write down the last upstream commit they cover
   (a hash, never `upstream/main`, which may have moved while you worked),
   and merge exactly that into a branch off `main` with
   `git merge -s ours <hash>`, in its own PR. Check that the merge changes no
   file (`git diff main HEAD` is empty).
3. Merge that PR with a **merge commit**. A squash or a rebase merge drops the
   second parent, and with it the whole point.

The `-s ours` merge only states that the commits were handled; the table of
skipped commits is still where the reasons live. A commit skipped for a
reason (a security hole, their hosted service, their branding) stays skipped
even though git now calls it merged.

Confirm a specific commit by its hash in our messages, since cherry-picks
carry it:

```bash
git log origin/main --format='%H%n%B' | grep <upstream-hash>
```

`git cherry` and subject matching still do not work for that, because this
fork renames and adapts what it takes. Six of the eight commits that "did not
match" on 2026-08-09 were present, one under a different filename and the
rest reworded.

Do this monthly. Forty-two commits took a day; four hundred would not be four
hundred times easier.

## Dependency versions

No longer in step with upstream, on purpose. At the August 2026 sync our
`package.json` differed from theirs on 7 of 268 shared packages, all of them
the ESLint 9 upgrade, and this section argued for keeping it that way. #59
(September 2026) moved every dependency that could go to latest instead,
Prisma 7 included. Against `upstream/main` at `36d5fc7b` (2026-09-03) we differ
on **185 of 232 shared packages**; `@prisma/client` is 7.9.1 here and 6.5.0
there.

The cost is paid at cherry-pick time:

- Upstream commits import `@prisma/client`; rewrite each one to the generated
  client, as the checklist above says. CI catches a missed one; local `tsc`
  may not.
- A picked commit that touches `package.json` or the lockfile conflicts more
  often. Keep our version unless theirs is newer, then regenerate the lockfile
  with `pnpm install`.
