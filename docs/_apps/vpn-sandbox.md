---
title: "RobOS VPN Sandbox"
package: vpn-sandbox
category: "security-vault"
icon: vpn-sandbox.svg
summary: "Zero-leak OpenVPN provider & account manager (IPVanish built-in) that sandbox-launches executables via Linux network namespaces and strict iptables kill-switch rules"
description: "Zero-leak OpenVPN provider & account manager (IPVanish built-in) that sandbox-launches executables via Linux network namespaces and strict iptables kill-switch rules"
---

**RobOS VPN Sandbox** (`packages/vpn-sandbox`) manages OpenVPN providers and accounts across RobOS (with **IPVanish** built in) and launches any executable inside a dedicated Linux network namespace (`ip netns`) locked with dual-layer `iptables` and `ip6tables` rules so that the normal host IP can never carry internet traffic from the sandboxed application.

## Key Capabilities

1. **Tracked OpenVPN Providers & Accounts (IPVanish Built-in)**:
   - Shared across **RobOS VPN Sandbox** and **RobOS Preferences → OpenVPN & VPN Accounts** (`~/.config/robos/ovpn-accounts.json`).
   - Pre-configured **IPVanish** provider with curated regional `.ovpn` server profiles (`nyc-a01`, `chi-a01`, `lax-a01`, `ams-a01`, `lon-a01`, `fra-a01`, etc.), official IPVanish CA certificate (`ca.ipvanish.com.crt`), and one-click profile sync from `configs.ipvanish.com`.
   - Passwords are stored encrypted in `pass` (`robos/ovpn/<provider>/<account>`) — never in plaintext configuration files.
2. **5-Layer Zero-Host-IP Leak Sandbox**:
   - **Layer 1 (`ip netns` Isolation)**: Launches the target executable inside `robos_vpn_<id>`, where physical host interfaces (`eth0`, `wlan0`) do not exist.
   - **Layer 2 (`ip6tables` + `sysctl` IPv6 Blackout)**: Disables IPv6 and sets `ip6tables -P OUTPUT DROP`.
   - **Layer 3 (In-Namespace `iptables` Default-DROP + UID Owner Lock)**: Sets `iptables -P OUTPUT DROP`, permits only `uid 0` (`openvpn`) to send encrypted carrier packets over `veth_n_<id>` to `<vpn_server_ip>:<vpn_port>`, and forces all application traffic (`uid != 0`) through `-o tun+`.
   - **Layer 4 (Host Kernel `FORWARD` & `POSTROUTING` Lock)**: Host `FORWARD` chain drops any packet from `veth_h_<id>` not addressed to `<vpn_server_ip>:<vpn_port>`.
   - **Layer 5 (Namespace DNS + Capability Stripping)**: Binds `/etc/netns/robos_vpn_<id>/resolv.conf` to VPN-tunneled DNS and strips `CAP_NET_ADMIN` / `CAP_NET_RAW` from the launched executable.
