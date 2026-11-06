#!/usr/bin/env bash
# Build the single rowbose.com site, matching the Pages workflow.
set -euo pipefail
cd "$(dirname "$0")/.."
OUT="${1:-_site}"
node scripts/stage-release-data.cjs
scripts/stage-site-data.sh
jekyll build -s site -d "$OUT"
node scripts/check-install-docs.cjs "$OUT"
node scripts/check-site-pages.cjs "$OUT"
echo "Built $OUT/"
