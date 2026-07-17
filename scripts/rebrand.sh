#!/usr/bin/env bash
# Idempotent Postiz -> PostQueen brand sweep. Re-run after every upstream merge.
#
# NOT covered by this script (manual checklist after upstream merges):
#   - libraries/react-shared-libraries/src/helpers/testomonials.tsx (keep emptied/PostQueen-only quotes)
#   - apps/frontend/src/app/(app)/(preview)/p/[id]/page.tsx (upstream draws "postiz" via SVG paths)
#   - .github/PULL_REQUEST_TEMPLATE.md (keep CLA-free version), CCLA.md/ICLA.md/FUNDING.yaml/sonar (keep deleted)
#   - logo components (new-layout/logo.tsx, ui/logo-text.component.tsx) + public/ and extension icons
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

# Text files under git, minus protected paths.
FILES=$(git ls-files -- . \
  ':!README.md' ':!CHANGELOG.md' ':!LICENSE' \
  ':!pnpm-lock.yaml' \
  ':!libraries/postiz-wallets/**' \
  ':!scripts/rebrand.sh' \
  ':!apps/frontend/public/**' ':!apps/extension/public/**' \
  | while IFS= read -r f; do [ -f "$f" ] && grep -Iq . "$f" 2>/dev/null && printf '%s\n' "$f"; done)

run() { printf '%s\n' "$FILES" | tr '\n' '\0' | xargs -0 perl -pi -e "$1"; }

# 1. Protect vendored @postiz/wallets tokens (root package.json dep + wallet.provider.tsx import).
run 's/\@postiz\/wallets/__PQ_KEEP_PKG__/g; s/postiz-wallets/__PQ_KEEP_DIR__/g'

# 2. Repo slugs (most specific first).
run 's/gitroomhq\/postiz-app/GkhanKINAY\/postqueen-app/g'
run 's/gitroomhq\/postiz-agent/GkhanKINAY\/postqueen-agent/g'
run 's/gitroomhq\/postiz-docker-compose/GkhanKINAY\/postqueen-docker-compose/g'
run 's/gitroomhq_postiz-app/GkhanKINAY_postqueen-app/g'

# 3. Emails before the generic domain rule.
run 's/nevo\@postiz\.com/support\@postqueen.ai/g'
run 's/\@postiz\.com/\@postqueen.ai/g'

# 4. Domains, subdomain-preserving (api./docs./platform./affiliate./contribute./discord. etc).
run 's/((?:[a-z0-9-]+\.)*)postiz\.com/${1}postqueen.ai/g'

# 5. Env vars and remaining all-caps.
run 's/POSTIZ_/POSTQUEEN_/g'
run 's/POSTIZ/POSTQUEEN/g'

# 6. Brand words — TitleCase before lowercase.
run 's/Postiz/PostQueen/g'
run 's/postiz/postqueen/g'

# 7. Transliterated brand names (he "פוסטיז", bn "পোস্টিজ").
printf '%s\n' "$FILES" | tr '\n' '\0' | xargs -0 perl -CSD -pi -e 's/\N{U+05E4}\N{U+05D5}\N{U+05E1}\N{U+05D8}\N{U+05D9}\N{U+05D6}/PostQueen/g; s/\N{U+09AA}\N{U+09CB}\N{U+09B8}\N{U+09CD}\N{U+099F}\N{U+09BF}\N{U+099C}/PostQueen/g'

# 8. Targeted Gitroom fixes ONLY — never replace lowercase "gitroom" generically (@gitroom/* aliases).
perl -pi -e 's/"name": "gitroom"/"name": "postqueen"/' package.json
perl -pi -e 's/\x{00A9} 2024 Your Gitroom Limited All rights reserved\./\x{00A9} 2026 PostQueen. All rights reserved./; s/&copy; 2024 Your Gitroom Limited All rights reserved\./&copy; 2026 PostQueen. All rights reserved./' \
  libraries/nestjs-libraries/src/database/prisma/agencies/agencies.service.ts

# 9. Restore protected tokens.
run 's/__PQ_KEEP_PKG__/\@postiz\/wallets/g; s/__PQ_KEEP_DIR__/postiz-wallets/g'

echo "Rebrand sweep complete."
