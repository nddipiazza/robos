#!/usr/bin/env bash
# Install all RobOS apps into the local GNOME app launcher.
#
# - npm installs each app in-place (packages/<app-id>/node_modules)
# - Generates ~/.local/share/applications/robos-<app-id>.desktop for each app,
#   rewriting Exec/Icon to point at the local repo paths
# - Refreshes the GNOME/freedesktop app database so apps appear immediately
#
# Usage:
#   scripts/install-local.sh            # install all apps
#   scripts/install-local.sh <app-id>   # install/update one app
#   scripts/install-local.sh --uninstall  # remove all robos .desktop files

set -e

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APPS_DIR="$HOME/.local/share/applications"
mkdir -p "$APPS_DIR"

# ── helpers ──────────────────────────────────────────────────────────────────

install_app() {
  local app_id="$1"
  local app_dir="$REPO_ROOT/packages/$app_id"

  if [[ ! -f "$app_dir/main.js" ]]; then
    echo "  skip $app_id (no main.js)"
    return
  fi

  # Find the .desktop file (name may differ from app_id, e.g. robos-app-launcher)
  local desktop_src
  desktop_src="$(find "$app_dir" -maxdepth 1 -name "*.desktop" | head -1)"
  if [[ -z "$desktop_src" ]]; then
    echo "  skip $app_id (no .desktop file)"
    return
  fi

  # npm install if electron binary is missing
  if [[ ! -f "$app_dir/node_modules/.bin/electron" ]]; then
    echo "  → npm install $app_id"
    (cd "$app_dir" && npm install --quiet 2>&1 | grep -v "^npm warn" || true)
  fi

  local electron_bin="$app_dir/node_modules/.bin/electron"
  local icon_path="$app_dir/icon.svg"
  local desktop_dest="$APPS_DIR/robos-${app_id}.desktop"

  # Rewrite Exec and Icon to local paths; strip /usr/local/share/robos paths
  sed \
    -e "s|Exec=.*|Exec=${electron_bin} --no-sandbox --disable-gpu --disable-dev-shm-usage ${app_dir}|" \
    -e "s|Icon=.*|Icon=${icon_path}|" \
    "$desktop_src" > "$desktop_dest"

  echo "  ✓ $app_id → $desktop_dest"
}

uninstall_all() {
  echo "Removing RobOS .desktop files from $APPS_DIR..."
  find "$APPS_DIR" -maxdepth 1 -name "robos-*.desktop" -delete
  update-desktop-database "$APPS_DIR" 2>/dev/null || true
  echo "Done."
  exit 0
}

# ── main ─────────────────────────────────────────────────────────────────────

if [[ "$1" == "--uninstall" ]]; then
  uninstall_all
fi

echo "RobOS local install → $APPS_DIR"
echo ""

if [[ -n "$1" ]]; then
  # Single app mode
  install_app "$1"
else
  # All apps
  for app_dir in "$REPO_ROOT/packages"/*/; do
    app_id="$(basename "$app_dir")"
    install_app "$app_id"
  done
fi

echo ""
echo "Refreshing app database..."
update-desktop-database "$APPS_DIR" 2>/dev/null || true

echo ""
echo "Done! Open the GNOME app launcher (Super key) and search for RobOS apps."
echo "To uninstall: scripts/install-local.sh --uninstall"
