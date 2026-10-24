---
title: "RobOS VPN Sandbox"
package: vpn-sandbox
category: "security-vault"
icon: vpn-sandbox.svg
summary: "Launch any desktop or CLI app inside an isolated Linux network namespace (ip netns) routed exclusively through OpenVPN with a 3-barrier kernel kill-switch."
description: "Zero-leak OpenVPN application launcher (IPVanish built-in) that confines executables to per-app Linux network namespaces with dual-layer iptables/ip6tables kill-switch rules and live E2E drop verification."
related:
  - /security/
  - /apps/vpn-servers/
  - /apps/pass-manager/
  - /apps/software-center/
---

**RobOS VPN Sandbox** (`packages/vpn-sandbox`, window title **VPN App Launcher**) launches individual desktop or CLI applications (such as Firefox, Transmission, or `curl`) inside a dedicated Linux network namespace (`ip netns`) bound to your OpenVPN provider so that the application's traffic can only exit through the VPN tunnel (`tun0`) and your normal public IP is completely unreachable.

![RobOS VPN Sandbox Live Kill-Switch Proof]({{ '/assets/images/security/vpn-sandbox-killswitch-proven.png' | relative_url }})

## Requirements

- Linux with `iproute2` (`ip netns`), `iptables` / `ip6tables`, `openvpn`, and `util-linux` (`setpriv`).
- At least one OpenVPN account configured in [RobOS VPN Servers]({{ '/apps/vpn-servers/' | relative_url }}) or [RobOS Preferences]({{ '/apps/robos-preferences/' | relative_url }}).
- On first launch of a sandboxed app, GNOME Polkit (`pkexec`) prompts once to install `/etc/sudoers.d/robos-vpn-sandbox` so the sandbox engine can create and tear down isolated network namespaces without repeated prompts.

## Use it

1. **Choose VPN Account & Server Location.** Pick your account (`IPVanish`, `ProtonVPN`, `Mullvad`, `NordVPN`, or custom `.ovpn`) and server location (3,598 built-in IPVanish servers) in the top selector bar. The header displays **Your Normal IP** (your real external public IPv4 address outside the VPN) so you can always contrast it against the app's VPN exit IP.
2. **Test VPN Connection or Prove Kill-Switch.**
   - **Test VPN Connection** runs a 6-point Zero-Leak Audit against the selected account and server profile.
   - **Prove Kill-Switch** runs a live 5-step fault-injection proof in the Linux kernel: it starts an isolated namespace and OpenVPN tunnel, verifies the external VPN IP from inside the namespace as an unprivileged user (`uid 1000`), force-kills the OpenVPN daemon (`kill -9`) mid-flight while keeping the namespace and `veth` default route up, attempts 4 egress probes (HTTPS, direct TCP `1.1.1.1:80`, direct UDP `8.8.8.8:53`, and direct UDP to the VPN server IP as `uid 1000`), and confirms via kernel `iptables -L OUTPUT -v -n -x` counters that 100% of post-drop packets are dropped with 0 bytes leaked to your normal IP.
3. **Launch a Saved App or Any Executable.**
   - **Saved Apps**: If `transmission-gtk` is installed (for example via [RobOS Software Center]({{ '/apps/software-center/' | relative_url }})), a default **Transmission** profile is pre-populated automatically alongside a **Web Browser** profile.
   - **Launch Another App**: Pick any installed desktop application from the dropdown, browse for a binary, or type a command (e.g., `firefox`, `transmission-gtk`) and optional arguments, then click **Launch via VPN** (or **Save to List**).
   - For browsers like Firefox (including Ubuntu Snap Firefox) and Chromium/Chrome, the engine automatically isolates the browser profile (`~/.config/robos/vpn-browser-profiles/<browser>`), passes `--no-remote --new-instance`, and wraps execution in `dbus-run-session` so the browser never hands off windows to an existing non-VPN desktop process.
4. **Manage Running VPN Apps.**
   - Each card in **Running VPN Apps** shows the active command, VPN server, verified **App Public IP (VPN)**, and confirmation that **Your Normal IP** is blocked for that app.
   - Click **Check VPN Traffic** to re-verify the tunnel, **Stop** to terminate the process and tear down its `robos_vpn_<id>` namespace, **✕** to remove a card from the list, **Clear Stopped** to prune finished sessions, or **Stop All Apps** in the header for an immediate emergency kill of all sandboxed apps.

## 3-Barrier Kernel Kill-Switch Architecture

![RobOS VPN Kill-Switch Architecture Diagram]({{ '/assets/images/security/vpn-killswitch-architecture.png' | relative_url }})

1. **Barrier 1 — In-Namespace `iptables` Default-DROP + UID Owner Lock**: Inside `robos_vpn_<id>`, `iptables -P OUTPUT DROP` and `ip6tables -P OUTPUT DROP` block all traffic by default. The target app runs as your unprivileged desktop user (`uid 1000`) with `CAP_NET_ADMIN` and `CAP_NET_RAW` stripped (`setpriv --inh-caps=-net_admin,-net_raw`). Only `-o tun+` is open to `uid 1000`; on `veth_n_<id>`, only `uid 0` (`openvpn`) to `<vpn_server_ip>:<vpn_port>` is accepted, followed by `-A OUTPUT -o veth_n_<id> -j DROP`.
2. **Barrier 2 — Host Kernel `FORWARD` Chain (`ROBOS_VPN_FWD_<id>`)**: On the host side (`veth_h_<id>`), the kernel only forwards packets from `10.203.X.2/32` to `<vpn_server_ip>/32:<vpn_port>` and drops all other packets before NAT.
3. **Barrier 3 — Destination-Scoped Host `POSTROUTING` NAT**: The `MASQUERADE` rule only matches `-s 10.203.X.2/32 -d <vpn_server_ip>/32 -p udp --dport 443`, so the kernel has no NAT rule to translate namespace packets to your normal public IP for any other destination.
4. **Namespace-Scoped DNS & NSS**: Writes `/etc/netns/robos_vpn_<id>/resolv.conf` and `/etc/netns/robos_vpn_<id>/nsswitch.conf` (`hosts: files dns`) and launches OpenVPN with `--dns-updown disable` so sandboxed apps resolve DNS exclusively over `tun0` and never touch host `systemd-resolved`.

## Run it

Launch **RobOS VPN Sandbox** from the desktop or App Launcher, or run:

```bash
scripts/dev-launch.sh vpn-sandbox
```
