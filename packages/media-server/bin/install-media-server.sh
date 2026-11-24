#!/usr/bin/env bash
# Installs and enables the always-on headless RobOS Media Server (:19234)
# as a persistent systemd --user service (`robos-media-server.service`),
# registers its MCP server in ~/.config/robos/mcp/servers.json, and adds it
# to ~/.config/robos/media-servers.json so RobOS Preferences keeps clients synced.
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
MEDIA_PKG="$(cd "$HERE/.." && pwd)"
PORT="${ROBOS_MEDIA_SERVER_PORT:-19234}"
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

RUN_DIR="$HOME/.local/share/robos/media-server"
UNIT_DIR="$HOME/.config/systemd/user"
mkdir -p "$RUN_DIR" "$UNIT_DIR" "$HOME/.local/bin" "$HOME/.config/robos/mcp"

# Install convenience CLI shims
ln -sf "$MEDIA_PKG/bin/robos-media-server.js" "$HOME/.local/bin/robos-media-server"
ln -sf "$MEDIA_PKG/bin/media-server-mcp.js" "$HOME/.local/bin/robos-media-server-mcp"
chmod +x "$MEDIA_PKG/bin/robos-media-server.js" "$MEDIA_PKG/bin/media-server-mcp.js" "$MEDIA_PKG/server.js" || true

cat > "$UNIT_DIR/robos-media-server.service" <<EOF
[Unit]
Description=RobOS Media Server & MCP (Movies, Shows, Music, Books :${PORT})
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
Environment="ROBOS_MEDIA_SERVER_PORT=${PORT}"
Environment="ROBOS_MEDIA_SERVER_HOST=0.0.0.0"
Environment="PATH=%h/.local/bin:%h/.local/share/robos/node/bin:/usr/local/bin:/usr/bin:/bin"
ExecStart="${NODE_BIN}" "${MEDIA_PKG}/server.js"
Restart=always
RestartSec=3
UMask=0022
NoNewPrivileges=true

[Install]
WantedBy=default.target
EOF

systemctl --user daemon-reload
systemctl --user enable robos-media-server.service
systemctl --user restart robos-media-server.service
loginctl enable-linger "$USER" 2>/dev/null || sudo -n loginctl enable-linger "$USER" 2>/dev/null || true

echo "RobOS Media Server active on 0.0.0.0:${PORT}"
systemctl --user status robos-media-server.service --no-pager || true
