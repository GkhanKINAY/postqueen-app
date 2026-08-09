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

## Next time

```bash
git fetch upstream
git log --reverse --no-merges --format='%ad %h %s' --date=short \
  $(git merge-base HEAD upstream/main)..upstream/main
```

Anything already taken will have its hash in our history:

```bash
git log origin/main --format='%H%n%B' | grep <upstream-hash>
```

Do this monthly. Forty-two commits took a day; four hundred would not be four
hundred times easier.

## Dependency versions

Kept deliberately in step with upstream. At the August 2026 sync our
`package.json` differed from theirs on **7 of 268 shared packages**, all of them
the ESLint 9 upgrade. That is what makes cherry-picking cheap, and it is the
reason `@prisma/client` stays on 6 — it is used in 104 files, and moving to 7
alone would put us on a different API from every commit upstream writes next.
Minor and patch upgrades are free; majors on low-usage packages are fine; the
high-churn shared surface waits for upstream.
