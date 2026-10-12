#!/usr/bin/env bash
# Stages the App Directory data for the front site (site/): the front matter of
# every docs/_apps/*.md (bodies are dropped; they use {% link %} tags that only
# resolve inside the v1 site) and the app category list.
set -euo pipefail
cd "$(dirname "$0")/.."
rm -rf site/_apps && mkdir -p site/_apps site/_data
for f in docs/_apps/*.md; do
  awk 'BEGIN{n=0} /^---[ \t]*$/{n++; print; if(n==2) exit; next} n==1{print}' "$f" > "site/_apps/$(basename "$f")"
done
cp docs/_data/app_categories.yml site/_data/
