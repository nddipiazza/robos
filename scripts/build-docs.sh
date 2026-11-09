#!/usr/bin/env bash
# Build the single rowbose.com site, matching the Pages workflow.
set -euo pipefail
cd "$(dirname "$0")/.."
OUT="${1:-_site}"
node scripts/stage-release-data.cjs
scripts/stage-site-data.sh
rm -rf "$OUT"
if command -v jekyll >/dev/null 2>&1; then
  jekyll build -s site -d "$OUT"
else
  OUT_ABS="$(python3 -c 'import os,sys; print(os.path.abspath(sys.argv[1]))' "$OUT")"
  OUT_PARENT="$(dirname "$OUT_ABS")"
  mkdir -p "$OUT_PARENT"
  docker run --rm -u "$(id -u):$(id -g)" \
    -v "$PWD:/repo" \
    -v "$OUT_PARENT:/out_parent" \
    -w /repo \
    --entrypoint jekyll \
    ghcr.io/actions/jekyll-build-pages:v1.0.13 \
    build -s site -d "/out_parent/$(basename "$OUT_ABS")"
fi
node scripts/check-install-docs.cjs "$OUT"
node scripts/check-site-pages.cjs "$OUT"
node scripts/check-blog-seo.cjs "$OUT"
echo "Built $OUT/"
