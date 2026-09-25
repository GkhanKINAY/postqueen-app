#!/usr/bin/env bash
#
# Workflow gate.
#
# This repository is public and anyone can fork it or open a pull request.
# GitHub keeps secrets away from a fork's pull request runs, except in
# workflows it cannot see through: `pull_request_target` and `workflow_run`
# run with this repository's secrets while they can check out the fork's code,
# and `issue_comment` runs with them for a comment anyone can write. None
# exists here, and upstream (gitroomhq/postiz-app) could add one in any sync.
# So this fails CI when:
#
#   1. any workflow uses one of those triggers, however it is quoted;
#   2. any workflow hands over every secret at once (`secrets: inherit`,
#      `toJSON(secrets)`, `secrets[...]`);
#   3. SENTRY_AUTH_TOKEN is read in any workflow other than
#      build-containers.yml, which uploads the frontend's source maps;
#   4. build-containers.yml reads it in any form but the one guarded line
#      that limits it to a tag pushed to this repository.
#
# It is a tripwire for our own merges and upstream syncs, not a boundary: a
# fork's pull request runs its own copy, and gets no secrets anyway.
#
#   scripts/check-workflows.sh

set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WORKFLOWS="$ROOT/.github/workflows"
CONTAINERS="$WORKFLOWS/build-containers.yml"
EXPECTED="SENTRY_AUTH_TOKEN: \${{ github.repository == 'GkhanKINAY/postqueen-app' && github.event_name == 'push' && startsWith(github.ref, 'refs/tags/') && secrets.SENTRY_AUTH_TOKEN || '' }}"

FAILED=0

if [ ! -f "$CONTAINERS" ]; then
  echo "FAIL — $CONTAINERS is missing; the Sentry token guard lives there."
  exit 1
fi

for file in "$WORKFLOWS"/*.y*ml; do
  name="$(basename "$file")"
  # Full-line comments may mention anything; everything else counts.
  code="$(grep -v '^[[:space:]]*#' "$file")"

  # 1. and 2. Triggers that run fork or public input with secrets, and ways
  #    to hand over all of them.
  hits="$(printf '%s\n' "$code" | grep -nE '(^|[^A-Za-z0-9_])(pull_request_target|workflow_run|issue_comment)([^A-Za-z0-9_]|$)|toJSON\(secrets\)|secrets:[[:space:]]*inherit|secrets\[')"
  if [ -n "$hits" ]; then
    printf '%s\n' "$hits" | sed "s|^|$name:|"
    echo "FAIL — $name: a trigger that runs fork or public input with this repository's secrets, or all secrets handed over at once."
    FAILED=1
  fi

  # 3. The Sentry token belongs to the container build only.
  if [ "$name" != "build-containers.yml" ] && printf '%s\n' "$code" | grep -q 'SENTRY_AUTH_TOKEN'; then
    echo "FAIL — $name reads SENTRY_AUTH_TOKEN; only build-containers.yml may."
    FAILED=1
  fi
done

# 4. In the container build, the secret appears exactly once, on the guarded
#    line, spelled exactly as expected.
reads="$(grep -v '^[[:space:]]*#' "$CONTAINERS" | grep -E 'secrets[.[]')"
if [ "$(printf '%s\n' "$reads" | sed 's/^[[:space:]]*//')" != "$EXPECTED" ]; then
  printf '%s\n' "$reads"
  echo "FAIL — build-containers.yml must read the secret once, as: $EXPECTED"
  FAILED=1
fi

if [ "$FAILED" -ne 0 ]; then
  exit "$FAILED"
fi
echo "PASS — no fork-exposed triggers or secret dumps, and the Sentry token stays in the tag build."
