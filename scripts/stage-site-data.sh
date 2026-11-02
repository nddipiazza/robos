#!/usr/bin/env bash
# Stages the App Directory data for the front site (site/): every docs/_apps/*.md,
# body included, with v1-only links rewritten (see scripts/stage-site-apps.cjs), so
# each app gets a page at /apps/<slug>/; plus the app category list.
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p site/_data
node scripts/stage-site-apps.cjs
cp docs/_data/app_categories.yml site/_data/
