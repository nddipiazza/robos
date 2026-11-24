#!/usr/bin/env bash
# Installs and enables the always-on RobOS Preferences Sync Service
# (`robos-preferences-sync.service`) to keep Config Sync & RobOS Media Services
# (Movie Player, Audio Player, Books, MCP) automatically updated in the background.
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
PREFS_PKG="$(cd "$HERE/.." && pwd)"
NODE_BIN="${ROBOS_NODE_BIN:-}"
if [ -z "$NODE_BIN" ]; then
  if [ -x "$HOME/.local/share/robos/node/bin/node" ]; then
    NODE_BIN="$HOME/.local/share/robos/node/bin/node"
  else
    NODE_BIN="$(command -v node || true)"
  fi
fi

if [ -z "$NODE_BIN" ] || [ ! -x "$NODE_BIN" ]; then
  echo "Error: Node.js binary not found." >&2
  exit 1
fi

UNIT_DIR="$HOME/.config/systemd/user"
mkdir -p "$UNIT_DIR"
chmod +x "$PREFS_PKG/bin/preferences-service.js" || true

cat > "$UNIT_DIR/robos-preferences-sync.service" <<EOF
[Unit]
Description=RobOS Preferences & Media Service Auto-Sync
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
Environment="PATH=%h/.local/bin:%h/.local/share/robos/node/bin:/usr/local/bin:/usr/bin:/bin"
ExecStart="${NODE_BIN}" "${PREFS_PKG}/bin/preferences-service.js"
Restart=always
RestartSec=5
UMask=0077
NoNewPrivileges=true

[Install]
WantedBy=default.target
EOF

systemctl --user daemon-reload
systemctl --user enable robos-preferences-sync.service
systemctl --user restart robos-preferences-sync.service
loginctl enable-linger "$USER" 2>/dev/null || true

echo "RobOS Preferences & Media Service Auto-Sync active."
systemctl --user status robos-preferences-sync.service --no-pager || true
