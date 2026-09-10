#!/usr/bin/env bash
#
# Boot gate.
#
# `pnpm run build` answers "does this compile". It does not answer "does this
# start", and in this repo those are genuinely different questions: on
# 2026-08-09 a lockfile refresh typechecked, built all three apps, and then
# could not boot, because `@mastra/core` had moved inside its own caret range
# and `@mastra/schema-compat` called a default export `zod-to-json-schema` no
# longer provides. Nothing that reads source can see that. Only starting can.
#
# So this boots a Nest application context from the *built* output of each
# service, which resolves the whole provider graph — every module, every
# injected service, every top-level import of every dependency — and exits
# non-zero if any of it throws. It stops short of listening on a port, so it
# needs no free port and leaves nothing running.
#
#   scripts/boot-check.sh                 both services
#   scripts/boot-check.sh backend         one of them
#
# Reads ../.env the same way the start scripts do, so it needs the same
# Postgres and Redis the app needs. Point it at a database that is not
# listening and the context does not throw — it *hangs*, indefinitely, which in
# a gate is worse than failing. Hence PQ_BOOT_TIMEOUT: a boot that has not
# finished in that many seconds is a failed boot.
#
# This is the gate every dependency change has to pass before it is committed,
# and the container image has to pass the same thing on the host before deploy
# — see docs/upstream-sync.md for why "it built" stopped being good enough.
#
# One thing this cannot check for you: when you go on to take screenshots,
# start the apps with `pnpm run start:prod:frontend` / `:backend`, never with a
# bare `next start` or `node main.js`. The env file lives at the repository
# root and only those scripts load it. Started without it, the backend dies
# loudly (`PostgresStore: invalid config`) but the frontend does not — it shows
# a skeleton for ever with an empty console, and you will spend the afternoon
# reading the wrong diff.

set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# The start scripts run `node --experimental-require-module`. Several
# dependencies are ESM-only and are reached from CommonJS output, so without
# the flag this check fails on things production handles fine.
NODE_FLAGS="--experimental-require-module"

# Generous, because a cold context resolves the whole provider graph. It only
# has to be shorter than a human's patience.
TIMEOUT="${PQ_BOOT_TIMEOUT:-120}"

SERVICES="${*:-backend orchestrator}"

FAILED=0

for svc in $SERVICES; do
  echo "› $svc"

  MAIN="$ROOT/apps/$svc/dist/apps/$svc/src/app.module.js"
  if [ ! -f "$MAIN" ]; then
    FAILED=1
    echo "  FAIL — no build at ${MAIN#$ROOT/}"
    echo "  Run 'pnpm run build:$svc' first. Booting a stale or absent dist is"
    echo "  how two source fixes were confirmed against code that never ran."
    continue
  fi

  # Run from the service directory, the way its own `start` script does, so
  # module resolution walks the same path.
  # The require is inside the try on purpose. A dependency that fails to load
  # throws synchronously, and left uncaught Node prints thirty lines of its own
  # loader internals before the sentence that says which module. That sentence
  # is the whole answer.
  OUT="$( cd "$ROOT/apps/$svc" && node $NODE_FLAGS -e "
    const watchdog = setTimeout(() => {
      console.error('timed out after $TIMEOUT s — the context never finished starting');
      console.error('(usually an unreachable Postgres or Redis, which hangs rather than throws)');
      process.exit(1);
    }, $TIMEOUT * 1000);
    (async () => {
      try {
        require('dotenv').config({ path: '$ROOT/.env' });
        const { NestFactory } = require('@nestjs/core');
        const { AppModule } = require('$MAIN');
        const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error'] });
        await app.close();
        clearTimeout(watchdog);
        process.exit(0);
      } catch (err) {
        console.error(err && err.message || err);
        if (err && err.stack) console.error(err.stack.split('\n').slice(1, 6).join('\n'));
        process.exit(1);
      }
    })();
  " 2>&1)"

  if [ $? -eq 0 ]; then
    echo "  ok — application context booted and closed"
  else
    FAILED=1
    echo "  FAIL — the context threw:"
    # Node's deprecation notices land on the same stream and are not why this
    # failed; left in, they push the sentence that matters past the cutoff.
    echo "$OUT" | grep -vE 'DeprecationWarning|--trace-deprecation' | sed 's/^/    /' | head -30
  fi
done

echo
if [ "$FAILED" -eq 0 ]; then
  echo "PASS — every service starts."
else
  echo "FAIL — see above. Do not commit a dependency change that cannot boot."
fi
exit "$FAILED"
