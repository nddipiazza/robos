# RobOS VPN Sandbox (`packages/vpn-sandbox`)

**RobOS VPN Sandbox** (window title **VPN App Launcher**) launches any desktop or CLI executable inside an isolated Linux network namespace (`ip netns`) bound to an OpenVPN tunnel (`tun0`) with a 3-barrier `iptables` / `ip6tables` kill-switch — and includes **VPN-Only App Guard** so sensitive applications (such as `qbittorrent` or `transmission-gtk`) are **unlaunchable from their base state** and **immediately killed (`SIGKILL`) if ever found running outside the VPN sandbox**.

## Features
- **VPN-Only App Guard (Block Base Launch & Kill Outside Sandbox)**:
  1. **Kernel-Verified Base-State Binary Gate**: Diverts the base executable (`dpkg-divert` → `<bin>.robos-vpn-real`), installs a kernel-netns gate wrapper (`readlink /proc/$$/ns/net` matched against `/run/netns/robos_vpn_*`), shadows `.desktop` launchers (`~/.local/share/applications/`), and disables login autostart so accidental desktop, `.torrent`, `magnet:`, or CLI launches outside the sandbox fail immediately (`exit 126`) before a single instruction of the real binary runs.
  2. **Continuous `/proc` Outside-Sandbox Process Killer (`SIGKILL`)**: Scans `/proc` both inside VPN Sandbox and via the always-on `systemd --user` background daemon (`robos-vpn-sandbox-guard.service`, `packages/vpn-sandbox/bin/vpn-sandbox-guard.js`). Any instance of a guarded app (including companion binaries like `qbittorrent-nox`, AppImages, or pre-existing processes) whose `/proc/<pid>/ns/net` is not an active `robos_vpn_*` namespace is immediately terminated (`SIGKILL`), while legitimate instances inside `robos_vpn_*` continue running undisturbed.
  3. **1-Click Unlock & Clean Restoration**: Unlocking an app atomically removes the gate and restores the original binary and `.desktop` / autostart entries.
- **Per-Application Network Namespace (`robos_vpn_<id>`)**: Collision-free multi-app namespace IDs and `10.203.<octet>.0/30` subnets; physical host interfaces do not exist inside the namespace.
- **3-Barrier Kernel Kill-Switch**:
  1. In-namespace `iptables -P OUTPUT DROP` + `ip6tables -P OUTPUT DROP`; only `-o tun+` is open to the unprivileged app (`uid 1000`, `CAP_NET_ADMIN` stripped), and `-o veth_n_<id>` only allows `uid 0` (`openvpn`) to the exact VPN server IP:port.
  2. Host `FORWARD` chain (`ROBOS_VPN_FWD_<id>`) drops any packet from `veth_h_<id>` not destined to `<vpn_server_ip>:<vpn_port>`.
  3. Host `POSTROUTING` `MASQUERADE` rule is restricted to `<vpn_server_ip>:<vpn_port>`.
- **Live Kernel Proofs (`Prove Kill-Switch` & `Prove VPN-Only Guard`)**:
  - `Prove Kill-Switch`: Starts a tunnel, verifies VPN exit IP, force-kills `openvpn` (`kill -9`) mid-flight, runs 4 egress probes, and verifies 0 leaked bytes.
  - `Prove VPN-Only Guard`: Locks an isolated probe app, proves base-state launch exits `126`, proves bypassed host-namespace execution is `SIGKILL`ed via `/proc`, proves in-namespace execution inside `robos_vpn_*` passes the gate and survives simultaneously, and verifies clean restoration.
- **Automatic VPN Down Detection & Next-in-Line Failover**: Switches a running `robos_vpn_<id>` namespace in-place to the next server in line (e.g. `Chicago 2` → `Chicago 3` → `Chicago 4`) without restarting the sandboxed application and with zero leaked packets.
- **Saved Apps**: Automatically seeds **qBittorrent** (`qbittorrent`) and **Transmission** (`transmission-gtk`) when installed, and isolates browser profiles (`~/.config/robos/vpn-browser-profiles/<browser>`) and D-Bus sessions.

## Launch, Guard CLI & Test
```bash
# Launch GUI app
scripts/dev-launch.sh vpn-sandbox

# Lock / unlock an app (e.g. qbittorrent) to VPN-Only mode from CLI
node packages/vpn-sandbox/bin/vpn-sandbox-guard.js --lock qbittorrent
node packages/vpn-sandbox/bin/vpn-sandbox-guard.js --status
node packages/vpn-sandbox/bin/vpn-sandbox-guard.js --unlock qbittorrent

# Install 24/7 systemd --user Outside-Sandbox Guard service
bash packages/vpn-sandbox/bin/install-vpn-sandbox-guard.sh

# Run unit tests
node --test packages/robos-lib/ovpn-providers.test.cjs

# Run live kernel E2E kill-switch, failover, and VPN-Only Guard proofs
ROBOS_VPN_LIVE_E2E=1 node --test tests/e2e/vpn-sandbox-killswitch-proof.test.cjs
```
