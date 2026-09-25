#!/usr/bin/env bash
#
# Workflow gate.
#
# This repository is public and anyone can fork it or open a pull request.
# GitHub keeps secrets away from a fork's pull request runs, with two
# exceptions it cannot see through: a workflow triggered by
# `pull_request_target` or `workflow_run` runs with this repository's secrets
# while it can check out the fork's code. Neither exists here, and upstream
# (gitroomhq/postiz-app) could add one in any sync. So this fails CI when:
#
#   1. any workflow uses either trigger;
#   2. SENTRY_AUTH_TOKEN is read in any workflow other than
#      build-containers.yml, which uploads the frontend's source maps;
#   3. build-containers.yml reads it without the guard that limits it to a tag
#      pushed to this repository.
#
#   scripts/check-workflows.sh

set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WORKFLOWS="$ROOT/.github/workflows"
GUARD="github.repository == 'GkhanKINAY/postqueen-app' && github.event_name == 'push' && startsWith(github.ref, 'refs/tags/')"

FAILED=0

# 1. Triggers that hand a fork's code this repository's secrets, written as a
#    key (`pull_request_target:`) or inside an `on:` list or string.
if grep -n -E '(^|[[:space:],[])(pull_request_target|workflow_run)([[:space:]]*:|[],[:space:]]|$)' "$WORKFLOWS"/*.y*ml; then
  echo "FAIL — pull_request_target or workflow_run above: it runs fork code with this repository's secrets."
  FAILED=1
fi

# 2. The Sentry token belongs to the container build only.
for file in "$WORKFLOWS"/*.y*ml; do
  if [ "$(basename "$file")" != "build-containers.yml" ] && grep -n 'SENTRY_AUTH_TOKEN' "$file"; then
    echo "FAIL — $(basename "$file") reads SENTRY_AUTH_TOKEN; only build-containers.yml may."
    FAILED=1
  fi
done

# 3. Every read of the secret in the container build carries the guard.
while IFS= read -r line; do
  case "$line" in
    *"$GUARD"*) ;;
    *)
      echo "$line"
      echo "FAIL — build-containers.yml reads secrets.SENTRY_AUTH_TOKEN without: $GUARD"
      FAILED=1
      ;;
  esac
done < <(grep -n 'secrets\.SENTRY_AUTH_TOKEN' "$WORKFLOWS/build-containers.yml")

if [ "$FAILED" -ne 0 ]; then
  exit 1
fi
echo "PASS — no fork-exposed triggers, and the Sentry token stays in the tag build."
