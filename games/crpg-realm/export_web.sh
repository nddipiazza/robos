#!/usr/bin/env bash
# Builds the browser version of the game and zips it for itch.io.
#   ./export_web.sh            -> build/web/ and build/realm-of-heroes-web.zip
# Needs the Godot 4.3 web export templates in
#   ~/.local/share/godot/export_templates/4.3.stable/
set -euo pipefail
cd "$(dirname "$0")"
GODOT_BIN="${GODOT_BIN:-$HOME/apps/godot4}"
rm -rf build/web && mkdir -p build/web
"$GODOT_BIN" --headless --path . --export-release "Web" build/web/index.html
(cd build/web && rm -f ../realm-of-heroes-web.zip && zip -q -r ../realm-of-heroes-web.zip .)
echo "Built build/web/ and build/realm-of-heroes-web.zip ($(du -h build/realm-of-heroes-web.zip | cut -f1))"
