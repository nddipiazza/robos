#!/usr/bin/env bash
# Rebuilds the figures and the PDF for https://rowbose.com/future from the one whitepaper source.
#   site/future/whitepaper.md  ->  site/future/skill-commons-whitepaper.pdf
# The web page (Jekyll) and the PDF (pandoc + Chromium) read the same markdown, so they cannot drift.
# Needs: node 20+, pandoc 3+, and the Chromium that Playwright installs (CHROME_BIN overrides the path).
set -euo pipefail
cd "$(dirname "$0")/.."

SRC=site/future/whitepaper.md
OUT=site/future/skill-commons-whitepaper.pdf
FIG="$(pwd)/site/assets/future"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

node scripts/future/figures.mjs

# Drop web-only markup (kramdown contents list), and point figures at the light palette on disk.
sed -E \
  -e '/^<p class="toc-title">/d' \
  -e '/^\* TOC$/d' \
  -e '/^\{:toc\}$/d' \
  -e "s#/assets/future/([a-z0-9-]+)\.svg#${FIG}/\1-light.svg#g" \
  "$SRC" > "$TMP/whitepaper.md"
cp scripts/future/print.css "$TMP/"

pandoc "$TMP/whitepaper.md" -f markdown+smart -t html5 --standalone \
  --template scripts/future/pdf-template.html --toc --toc-depth=2 \
  -V logo="$(pwd)/site/assets/logo-mark.png" -o "$TMP/whitepaper.html"

node scripts/future/render-pdf.mjs "$TMP/whitepaper.html" "$OUT" "The Skill Commons · Draft 2 · 12 October 2026 · rowbose.com/future"
echo "Built $OUT"
