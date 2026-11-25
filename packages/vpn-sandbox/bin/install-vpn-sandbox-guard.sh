#!/usr/bin/env bash
# Installs and enables the always-on RobOS VPN Sandbox Outside-Sandbox Process Killer
# (`robos-vpn-sandbox-guard.service`) so VPN-Only apps (e.g. qbittorrent, transmission)
# are immediately terminated if ever launched outside a `robos_vpn_*` namespace.
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
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

chmod +x "$HERE/vpn-sandbox-guard.js" || true

UNIT_DIR="$HOME/.config/systemd/user"
mkdir -p "$UNIT_DIR"

cat > "$UNIT_DIR/robos-vpn-sandbox-guard.service" <<EOF
[Unit]
Description=RobOS VPN Sandbox — Outside-Sandbox Process Killer & VPN-Only App Guard
After=default.target

[Service]
Type=simple
Environment="ROBOS_CONFIG_DIR=%h/.config/robos"
Environment="ROBOS_VPN_GUARD_INTERVAL_MS=400"
ExecStart="${NODE_BIN}" "${HERE}/vpn-sandbox-guard.js" --daemon
Restart=always
RestartSec=2
UMask=0077

[Install]
WantedBy=default.target
EOF

systemctl --user daemon-reload
systemctl --user enable robos-vpn-sandbox-guard.service
systemctl --user restart robos-vpn-sandbox-guard.service

echo "RobOS VPN Sandbox Guard active."
systemctl --user status robos-vpn-sandbox-guard.service --no-pager || true
