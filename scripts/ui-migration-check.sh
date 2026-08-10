#!/usr/bin/env bash
#
# UI migration guard.
#
# The redesign changes how the frontend looks, not what it does. These four
# checks are the evidence for that claim: they capture the app's observable
# contract as sorted text files and fail when a restyle quietly moves it.
#
#   types   — the frontend still compiles
#   api     — the same set of backend endpoints is still called
#   i18n    — no translation key was dropped, none was invented
#   routes  — no page appeared or disappeared
#   loops   — every indefinite animation is still switchable off for readers
#             who ask for less motion (this list is meant to stay empty)
#
# Usage:
#   scripts/ui-migration-check.sh                 compare against the baseline
#   scripts/ui-migration-check.sh --update        rewrite the baseline
#
# Use --update only when a step is *meant* to change one of these lists (step 4
# adds /channels, for example). Note the baseline update in the PR when you do:
# an unexplained baseline update is the one way this guard can be defeated.

set -uo pipefail

# Every list here is `sort`ed, and sort order is locale-dependent. A Mac's
# interactive default is en_US.UTF-8 and a CI runner's is C.UTF-8, which order
# `-`, `_`, `[` and spaces differently — api.txt as committed is C-sorted and is
# NOT valid en_US order, so without this the same tree diffs against itself
# depending on who ran the check.
export LC_ALL=C

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SRC="$ROOT/apps/frontend/src"
BASE="$ROOT/docs/ui-migration-baseline"
UPDATE=0
[ "${1:-}" = "--update" ] && UPDATE=1

mkdir -p "$BASE"

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

# Plain grep, not ripgrep: this has to run on a bare checkout and in CI.
scan() { grep -rEoh --include='*.ts' --include='*.tsx' "$1" "$SRC" 2>/dev/null; }

# --- collectors -------------------------------------------------------------
# Each writes a sorted, deduplicated list to $WORK/<name>.txt.

# Same as `scan`, but joins a call that wraps straight after its opening paren.
# Without this the patterns below only match `useSWR('/x'` written on one line,
# and eighteen real calls in this repo are written across two — so the api list
# was silently short by about 12% and reported "unchanged" for endpoints it had
# never seen. A wrapped call and an inline one are the same call.
#
# It reads comments too, and that is left alone deliberately. Stripping them
# first was tried: one perl pass over 800 files ate a regex literal here and a
# protocol-relative string there, and the i18n list lost eleven real keys while
# claiming to have found a behaviour change. A guard that damages what it counts
# is worse than one that occasionally counts a sentence — so the rule is on the
# writing instead: do not name a gate in prose next to the code that uses it.
scan_calls() {
  find "$SRC" \( -name '*.ts' -o -name '*.tsx' \) -type f -print0 \
    | xargs -0 perl -0777 -pe 's/\(\s*\n\s*/(/g' 2>/dev/null \
    | grep -Eo "$1"
}

collect_api() {
  # Endpoints reached through the custom fetch wrapper and through raw SWR keys.
  # Query strings are stripped: '/posts?week=3' and '/posts?day=1' are one
  # endpoint, and the redesign is expected to keep passing different params.
  #
  # A few SWR *cache keys* land in here too ('/billing-<tier>-<period>'). That is
  # acceptable: this guard detects changes to the set of strings handed to
  # fetch/useSWR, and a cache key changing is also worth being told about.
  {
    scan_calls "fetch\(['\"\`]/[^'\"\`?]*"
    scan_calls "useSWR(Mutation)?\(['\"\`]/[^'\"\`?]*"
  } | sed -E "s/^(fetch|useSWR|useSWRMutation)\(['\"\`]//" \
    | sed -E 's/[[:space:]]+$//' | sed -E 's/\$\{$//' \
    | sed 's#/$##' | grep -v '^$' | sort -u > "$WORK/api.txt"
}

collect_gates() {
  # Which feature gates the frontend still applies.
  #
  # Doc 03 lists about fifteen. They were walked by hand once, in step 8, and
  # nothing has protected them since — a restyle that dropped `tier?.autoPost`
  # would hand every user a paid tab and no list here would have moved, because
  # the api/i18n/routes lists cannot see a condition.
  #
  # Counted, not just named. A gate falling from two call sites to one is the
  # half-removal this is meant to catch, and a set alone would miss it. Benign
  # movement (extracting a shared condition) therefore needs --update and a line
  # in the log, which is the same discipline the other three lists already have.
  #
  # `tier?.x` and `tier.x` collapse to one entry: optional chaining coming or
  # going is not a gate change.
  scan_calls "tier\??\.[a-zA-Z_]+|user\??\.isLifetime|isTrailing|allowTrial|billingEnabled|trialLocked" \
    | sed -E 's/\?\./\./g' \
    | sort | uniq -c | sed -E 's/^ *([0-9]+) +(.*)$/\2 \1/' \
    | sort > "$WORK/gates.txt"
}

collect_i18n() {
  # The key is the first argument of t(); the second is only the English
  # fallback. Copy may be restyled around it, but the key set must not move.
  #
  # `scan_calls`, not `scan`: prettier wraps any t() whose English fallback is
  # long, and a line-at-a-time scan sees none of those. That was 151 keys — 17%
  # of the set — reported as "unchanged" without ever having been read.
  scan_calls "\bt\('[a-zA-Z0-9_.-]+'" \
    | sed -E "s/^t\('//; s/'$//" \
    | sort -u > "$WORK/i18n.txt"
}

collect_routes() {
  find "$ROOT/apps/frontend/src/app" -name 'page.tsx' 2>/dev/null \
    | sed "s#^$ROOT/apps/frontend/src/app##" \
    | sort > "$WORK/routes.txt"
}

collect_loops() {
  # Indefinite animations that do not also carry `pq-loop`.
  #
  # global.css says outright that this one cannot be enforced from the
  # stylesheet — CSS cannot match on an animation name, so whether a spinner
  # stops for `prefers-reduced-motion: reduce` is left to whoever writes the
  # component. It was left to them for a while: seventeen looping elements had
  # drifted off the convention, including the two spinners that sit behind
  # every `<Button loading>` and every page loader in the app.
  #
  # The baseline is *empty*, and any entry is a regression.
  #
  # Two arms, because a loop reaches the screen two ways:
  #
  #   1. a Tailwind `animate-*` utility in a className
  #   2. an inline `animation: … infinite`, which carries no utility at all —
  #      ui/spinner.tsx is the whole app's spinner and is invisible to arm 1
  #
  # Arm 1 joins wrapped lines first. Prettier puts the utility on its own line
  # inside `clsx(` more often than not — five of the twelve looping usages in
  # the tree, 42%, are written that way, and a line-at-a-time grep reads none
  # of them. That is the same blindness the note above collect_i18n describes.
  #
  # `motion-safe:` and `motion-reduce:` are Tailwind's own gate and count as
  # compliant. The one-shot entrances (pqPop, pqFadeDown, pqIn, pqTip) are not
  # loops and are deliberately outside the pattern — see global.css.
  #
  # Loops this stylesheet applies by *selector* rather than by class can never
  # match either arm, because the component's className has nothing in it:
  # `.loading-shimmer:before`, the tour's `[data-tourconn] [data-conn-card]`
  # glow, and Blueprint's three in the vendored polonto.css. All five are
  # switched off by name in global.css's reduced-motion block instead. If you
  # add another, add it there — this collector will not catch it for you.
  #
  # Three known blind spots, all latent today and all checked:
  #   - two looping utilities on one element: CSS only ever applies one
  #     `animation`, so `pq-loop` genuinely gates whichever wins the cascade
  #   - `className={cond ? …}` containing a `>`: the extract stops at the first
  #     one. No live case
  #   - brace nesting deeper than two levels inside a className: the collapse
  #     silently gives up. All 506 blocks in the tree collapse today
  #
  # A comment that merely names one of these utilities is still a false
  # positive outside a className — reword it rather than gating the code.
  local anim='animate-(pulse|spin|bounce|ping|marquee[A-Za-z-]*|\[[A-Za-z0-9_-]+_|pq(Unlim|Tick|Ring|Glow|Spin|Btn[A-Za-z]+))'

  # One file list, reused by both arms.
  find "$SRC" "$ROOT/libraries" -type d -name node_modules -prune -o \
    \( -name '*.ts' -o -name '*.tsx' \) -type f -print0 > "$WORK/loop-files"

  {
    # `//` comments are stripped before filtering, and only here. The collapse
    # pulls a comment sitting inside a className onto the class line, so a
    # `// TODO: pq-loop this` two lines above an ungated spinner would exempt
    # it. Narrow enough not to repeat collect_i18n's mistake: this pass feeds
    # the loop grep alone, never the i18n or api lists.
    xargs -0 perl -0777 -pe '
        s{(class[Nn]ame=\{(?:[^{}]|\{[^{}]*\})*\})}{ my $a = $1; $a =~ s{//[^\n]*}{}g; $a =~ s/\s+/ /g; $a }ges;
        s/\(\s*\n\s*/(/g;
      ' < "$WORK/loop-files" \
      | grep -Eo "class[Nn]ame=[^>]*" \
      | grep -E "$anim" \
      | grep -Ev "motion-(safe|reduce):$anim" \
      | grep -v 'pq-loop' \
      | grep -Eo "$anim"

    # Arm 2: inline `animation: … infinite`, which carries no `animate-` token
    # for arm 1 to find. `ui/spinner.tsx` is the whole app's spinner and lives
    # here.
    #
    # Comments come out first, and that is the whole trick: spinner.tsx's own
    # doc comment explains the `pq-loop` hook in prose, and any check that just
    # greps the file for the word exempts the one file this arm exists for.
    # One perl pass rather than two greps per file — 690 files was 1380
    # processes and 95% of this check's runtime.
    xargs -0 perl -0777 -ne '
        s{/\*.*?\*/}{}gs;
        s{//[^\n]*}{}g;
        next unless /animation(?:Name)?\s*:[^;{}]{0,160}infinite/s
                 || /animationIterationCount\s*:\s*.{0,20}infinite/s;
        next if /pq-loop/;
        # index/substr, not s{^\Q$root\E/}: \Q escapes regex metacharacters but
        # Perl still interpolates, so a clone path containing @ or $ would
        # silently fail to strip and emit absolute paths into the baseline.
        my $root = '"'"$ROOT"'"';
        my $p = $ARGV;
        $p = substr($p, length($root) + 1) if index($p, $root . "/") == 0;
        print "inline-animation $p\n";
      ' < "$WORK/loop-files"
  } \
    | sort | uniq -c | sed -E 's/^ *([0-9]+) +(.*)$/\2 \1/' \
    | sort > "$WORK/loops.txt"
}

collect_api
collect_i18n
collect_routes
collect_gates
collect_loops

# --- types ------------------------------------------------------------------

# Both apps, because the migration stopped being frontend-only: the tier rename,
# the lifetime route and the provider categories all live in libraries/ and
# apps/backend, and a guard that only compiles the frontend would have waved
# every one of them through.
#
# The backend is checked with `tsconfig.build.json`, which is what it actually
# builds with. Its `tsconfig.json` is stricter than the build and reports seven
# pre-existing errors in files nothing here touches; gating on those would mean
# the check is red before anyone starts.
TYPES_OK=1
for target in "frontend:apps/frontend/tsconfig.json" \
              "backend:apps/backend/tsconfig.build.json"; do
  name="${target%%:*}"
  conf="${target#*:}"
  echo "› types ($name)"
  TYPE_OUT="$WORK/tsc-$name.txt"
  if "$ROOT/node_modules/.bin/tsc" --noEmit -p "$ROOT/$conf" > "$TYPE_OUT" 2>&1; then
    echo "  ok — 0 errors"
  else
    TYPES_OK=0
    echo "  FAIL — tsc reported errors:"
    sed 's/^/    /' "$TYPE_OUT" | head -40
  fi
done

# --- list comparisons -------------------------------------------------------

FAILED=0
[ "$TYPES_OK" -eq 1 ] || FAILED=1

for name in api i18n routes gates loops; do
  current="$WORK/$name.txt"
  baseline="$BASE/$name.txt"
  count="$(wc -l < "$current" | tr -d ' ')"

  if [ "$UPDATE" -eq 1 ]; then
    cp "$current" "$baseline"
    echo "› $name"
    echo "  baseline written — $count entries"
    continue
  fi

  # A missing baseline used to be seeded here, silently and without failing.
  # That is fine on a laptop and useless in CI: the workspace is thrown away
  # every run, so an uncommitted baseline means the check writes it, prints
  # "baseline written", and passes — for ever. `loops.txt` is the list where
  # that bites hardest, because empty is also what "clean" looks like.
  if [ ! -f "$baseline" ]; then
    FAILED=1
    echo "› $name"
    echo "  FAIL — no baseline at ${baseline#$ROOT/}"
    echo "  Generate it with --update and commit it; an absent file cannot"
    echo "  guard anything."
    continue
  fi

  echo "› $name"
  if diff -q "$baseline" "$current" >/dev/null; then
    echo "  ok — $count entries, unchanged"
  else
    FAILED=1
    echo "  FAIL — the set changed:"
    diff "$baseline" "$current" | grep -E '^[<>]' | sed 's/^</    removed: /; s/^>/    added:   /'
    echo "  If this is intentional for this step, rerun with --update and say why in the log."
  fi
done

echo
if [ "$FAILED" -eq 0 ]; then
  echo "PASS — behaviour surface unchanged."
else
  echo "FAIL — see above."
fi
exit "$FAILED"
