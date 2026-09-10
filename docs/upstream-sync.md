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
a repeat post. Next time, upstream's next post workflow becomes our v1.0.9 the
same way. Take only the newest, adapt those three lines, and move both call
sites (`posts.service.ts`, and the missed-posts sweep in `post.activity.ts`).

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

## Where the sync currently stands

**Synced through `c9382d98` (2026-09-03).** Everything upstream had written by
that commit is either in this tree or listed below with a reason.

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

Also left out of commits that were otherwise taken: `chatgpt-app-submission.json`
(`61cc2d47`, `50b171e6`, `88332766`), upstream's ChatGPT app-directory listing
for their hosted service.

Move the watermark every time a sync PR merges. It is the only cheap way to
answer "are we current?" — see the trap below.

## Next time

```bash
git fetch upstream
git log --reverse --no-merges --format='%ad %h %s' --date=short \
  <watermark>..upstream/main
```

**Do not use `main..upstream/main` to answer "what is missing".** Cherry-picking
writes new hashes, so every commit ever taken keeps showing up as absent — that
range read 44 the day after a sync that had left only two commits outstanding.
`git cherry` and subject matching are both wrong here too, for the same reason
in reverse: this fork renames and adapts what it takes, so an identical change
shows as different. Six of the eight commits that "did not match" on 2026-08-09
were present, one under a different filename and the rest reworded.

Trust the watermark, and confirm a specific commit by looking for its hash:

```bash
git log origin/main --format='%H%n%B' | grep <upstream-hash>
```

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
