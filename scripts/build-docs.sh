#!/usr/bin/env bash
# Builds both docs sites the way .github/workflows/pages.yml does:
#   site/ -> _site/      (https://rowbose.com/)
#   docs/ -> _site/v1/   (https://rowbose.com/v1/, baseurl set in docs/_config.yml)
# Needs jekyll plus the gems in docs/Gemfile (the v1 site uses a remote theme).
set -euo pipefail
cd "$(dirname "$0")/.."
OUT="${1:-_site}"
scripts/stage-site-data.sh
jekyll build -s site -d "$OUT"
(cd docs && bundle exec jekyll build -d "../$OUT/v1")
echo "Built $OUT/ (front) and $OUT/v1/ (classic docs)"
