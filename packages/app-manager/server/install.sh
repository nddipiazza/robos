#!/usr/bin/env bash
# Run as the account hosting the RobOS client setup service.
set -euo pipefail
umask 077
source_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
install_dir="$HOME/.local/share/robos/client-setup"
config_dir="$HOME/.config/robos/client-setup"
state_dir="$install_dir/state"
export PATH="$HOME/.local/share/robos/node/bin:$PATH"
host="${1:?Usage: bash server/install.sh IPV4_ADDRESS [PORT]}"
port="${2:-19406}"
node_bin="$(command -v node)"
"$node_bin" -e 'const [host, port]=process.argv.slice(1); if (!require("node:net").isIPv4(host) || host==="0.0.0.0" || !/^[1-9]\d{3,4}$/.test(port) || port<1024 || port>65535) throw Error("Invalid listen address")' "$host" "$port"
mkdir -p "$config_dir" "$state_dir" "$install_dir/server" "$install_dir/lib" "$HOME/.config/systemd/user"
install -m 600 "$source_dir/server/setup-server.cjs" "$install_dir/server/setup-server.cjs"
install -m 600 "$source_dir/lib/profile-schema.cjs" "$install_dir/lib/profile-schema.cjs"
ln -sfn "$node_bin" "$install_dir/node"
if [[ ! -e "$config_dir/profile.json" ]]; then
  install -m 600 "$source_dir/server/profile.example.json" "$config_dir/profile.json"
fi
if [[ ! -e "$state_dir/key.pem" && ! -e "$state_dir/cert.pem" ]]; then
  cert_dir="$(mktemp -d "$state_dir/.cert-XXXXXXXX")"
  trap 'rm -f "$cert_dir/key.pem" "$cert_dir/cert.pem"; rmdir "$cert_dir"' EXIT
  openssl req -x509 -newkey ec -pkeyopt ec_paramgen_curve:prime256v1 -nodes -days 1825 \
    -subj '/CN=RobOS Client Setup' -keyout "$cert_dir/key.pem" -out "$cert_dir/cert.pem"
  mv "$cert_dir/key.pem" "$cert_dir/cert.pem" "$state_dir"
fi
printf '{"host":"%s","port":%s}\n' "$host" "$port" > "$config_dir/server.json.tmp"
mv "$config_dir/server.json.tmp" "$config_dir/server.json"
cat > "$HOME/.config/systemd/user/robos-client-setup.service" <<'UNIT'
[Unit]
Description=RobOS Client Setup
Wants=network-online.target
After=network-online.target

[Service]
ExecStart="%h/.local/share/robos/client-setup/node" "%h/.local/share/robos/client-setup/server/setup-server.cjs" serve
Restart=on-failure
RestartSec=5
UMask=0077
NoNewPrivileges=true
PrivateTmp=true

[Install]
WantedBy=default.target
UNIT
systemctl --user daemon-reload
systemctl --user enable robos-client-setup.service
systemctl --user restart robos-client-setup.service
