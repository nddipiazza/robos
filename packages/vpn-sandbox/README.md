# RobOS VPN Sandbox (`packages/vpn-sandbox`)

**RobOS VPN Sandbox** (window title **VPN App Launcher**) launches any desktop or CLI executable inside an isolated Linux network namespace (`ip netns`) bound to an OpenVPN tunnel (`tun0`) with a 3-barrier `iptables` / `ip6tables` kill-switch so the host's normal public IP can never be used by the sandboxed application.

## Features
- **Per-Application Network Namespace (`robos_vpn_<id>`)**: Physical host interfaces do not exist inside the namespace.
- **3-Barrier Kernel Kill-Switch**:
  1. In-namespace `iptables -P OUTPUT DROP` + `ip6tables -P OUTPUT DROP`; only `-o tun+` is open to the unprivileged app (`uid 1000`, `CAP_NET_ADMIN` stripped), and `-o veth_n_<id>` only allows `uid 0` (`openvpn`) to the exact VPN server IP:port.
  2. Host `FORWARD` chain (`ROBOS_VPN_FWD_<id>`) drops any packet from `veth_h_<id>` not destined to `<vpn_server_ip>:<vpn_port>`.
  3. Host `POSTROUTING` `MASQUERADE` rule is restricted to `<vpn_server_ip>:<vpn_port>`.
- **Live 5-Step Mid-Session Drop Proof (`Prove Kill-Switch`)**: Launches a real tunnel, verifies the VPN exit IP, force-kills `openvpn` (`kill -9`) while leaving `veth` up, runs 4 egress probes (HTTPS, TCP, UDP DNS, UDP to VPN server IP as `uid 1000`), and verifies via kernel `iptables` counters that 100% of post-drop packets are dropped with 0 bytes leaked to your normal IP.
- **Saved Apps**: Automatically creates a default **Transmission** profile when `transmission-gtk` is installed (e.g., via **RobOS Software Center**), and isolates browser profiles (`~/.config/robos/vpn-browser-profiles/<browser>`) and D-Bus sessions.

## Launch & Test
```bash
# Launch app
scripts/dev-launch.sh vpn-sandbox

# Run unit tests
node --test packages/robos-lib/ovpn-providers.test.cjs

# Run live kernel E2E kill-switch proof
ROBOS_VPN_LIVE_E2E=1 node --test tests/e2e/vpn-sandbox-killswitch-proof.test.cjs
```
