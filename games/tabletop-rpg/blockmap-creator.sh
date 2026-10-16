#!/usr/bin/env bash
# blockmap-creator.sh — Launch Tabletop Blockmap Creator for HeroQuest boards
set -e

DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$DIR/../.." && pwd)"
APP_DIR="$REPO_ROOT/packages/tabletop-blockmap-creator"

TARGET="${1:-first_light_dungeon.png}"

echo "🗺️ Opening Tabletop Blockmap Creator with: $TARGET"
exec "$APP_DIR/launch.sh" "$TARGET" "${@:2}"
