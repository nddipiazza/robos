#!/bin/bash
# Records the course's demo clips on a private virtual screen and converts them to GIFs.
# Usage: record.sh <work-dir> <output-dir>
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/../../../.." && pwd)"
WORK="$(realpath -m "$1")"
OUT="$(realpath -m "$2")"
ELECTRON="$REPO/packages/robos-test/node_modules/.bin/electron"

rm -rf "$WORK"
mkdir -p "$WORK" "$OUT"
xvfb-run -a -s "-screen 0 1280x720x24" "$ELECTRON" "$HERE" --no-sandbox --disable-gpu --disable-dev-shm-usage "$WORK" "$OUT"

for clip in "$WORK"/clips/*.webm; do
  name="$(basename "$clip" .webm)"
  ffmpeg -y -loglevel error -i "$clip" -vf "fps=8,scale=1120:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=128:stats_mode=diff[p];[b][p]paletteuse=dither=none:diff_mode=rectangle" -loop 0 "$OUT/$name.gif"
done
ls -la "$OUT"
