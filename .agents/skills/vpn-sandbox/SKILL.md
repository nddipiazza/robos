---
name: vpn-sandbox
description: Configure OpenVPN accounts and server profiles (IPVanish built-in), launch desktop or CLI executables inside isolated Linux network namespaces (ip netns) with 3-barrier iptables kill-switch enforcement, lock apps like qbittorrent to VPN-Only mode (blocking base launches and SIGKILLing any outside-sandbox instance), and run live E2E kernel proofs.
---

# RobOS VPN Sandbox, VPN-Only App Guard & Kill-Switch Proof

Manage OpenVPN accounts and server locations (`packages/vpn-servers`, `packages/robos-lib/ovpn-providers.js`), launch executables inside isolated Linux network namespaces (`packages/vpn-sandbox`, `packages/robos-lib/vpn-sandbox-engine.js`), lock applications like `qbittorrent` so they are unlaunchable in their base state and immediately `SIGKILL`ed if ever started outside `robos_vpn_*`, and execute live kernel E2E proofs (`tests/e2e/vpn-sandbox-killswitch-proof.test.cjs`).

## Input

`$ARGUMENTS` — Subcommand and arguments:
- `launch <executable> [args...]` — Launch an application inside an isolated `robos_vpn_<id>` network namespace routed over `tun0`
- `lock <executable>` — Lock an application (e.g. `qbittorrent`, `transmission-gtk`) to VPN-Only mode (installs kernel-netns base-launch gate, shadows `.desktop` launcher, and `SIGKILL`s any outside-sandbox instance)
- `unlock <executable>` — Remove VPN-Only lock and restore normal base-state launch
- `guard-status` — Inspect guarded apps, active background guard service, and killed/blocked outside-sandbox event log
- `test-account [account-id]` — Test saved OpenVPN credentials live against TLS 1.3 + `PUSH_REPLY`
- `prove-killswitch [account-id] [profile-id]` — Run the 5-phase live kernel fault-injection proof (`proveKillSwitchOnVpnDrop`)
- `prove-guard` — Run the 5-phase live kernel VPN-Only Guard proof (`proveVpnOnlyGuard`)
- `list-profiles [country-code]` — List or filter bundled IPVanish `.ovpn` server profiles (3,598 built-in locations)

## Procedure

1. **Verify or Configure OpenVPN Account (`robos-lib/ovpn-providers.js`)**:
   - Accounts live in `~/.config/robos/ovpn-accounts.json` with passwords encrypted in `pass` (`robos/ovpn/<provider>/<account>`) or the AES-256-GCM fallback vault (`~/.config/robos/ovpn/.vault/`).
   - Test credentials before launching:
     ```bash
     node -e '
       const { createOvpnManager } = require("./packages/robos-lib/ovpn-providers");
       createOvpnManager().testAccountConnection({}).then(r => console.log(JSON.stringify(r, null, 2)));
     '
     ```

2. **Lock an Application to VPN-Only Mode (`vpn-sandbox-guard.js`)**:
   - Prevent an app such as `qbittorrent` from ever running outside the VPN sandbox (blocks base binary/desktop launches with `exit 126` and continuously kills any outside-`robos_vpn_*` PID via `/proc/<pid>/ns/net` + `SIGKILL`):
     ```bash
     node packages/vpn-sandbox/bin/vpn-sandbox-guard.js --lock qbittorrent
     bash packages/vpn-sandbox/bin/install-vpn-sandbox-guard.sh
     ```
   - Unlock and restore normal base-state launch at any time:
     ```bash
     node packages/vpn-sandbox/bin/vpn-sandbox-guard.js --unlock qbittorrent
     ```

3. **Launch an Application Inside the VPN Sandbox (`robos-lib/vpn-sandbox-engine.js`)**:
   - Launch the GUI apps with `scripts/dev-launch.sh vpn-servers` or `scripts/dev-launch.sh vpn-sandbox`, or launch an executable programmatically via `launchSandboxedExecutable({ executable, args, accountId, profileId })`.
   - For browsers (`firefox`, `google-chrome-stable`, `chromium`), the engine automatically creates an isolated profile (`~/.config/robos/vpn-browser-profiles/<browser>`), passes `--no-remote --new-instance`, and wraps execution in `dbus-run-session`.

4. **Run the Live E2E Kill-Switch, Auto-Failover & VPN-Only Guard Proofs**:
   - Execute the live kernel proofs to verify:
     1. Killing `openvpn` (`kill -9`) mid-session drops `tun0` while keeping `veth_n_<id>` up and blocks 100% of post-drop HTTPS, TCP, and UDP egress probes in the kernel (`EPERM` / `DROP`).
     2. Automatic health detection (`checkSessionTunnelHealth`) seamlessly fails over in-place to the next server in line without restarting the sandboxed process.
     3. Locked VPN-Only apps refuse base-state execution (`exit 126`), any bypassed outside-sandbox process is `SIGKILL`ed via `/proc/<pid>/ns/net`, and authorized processes inside `robos_vpn_*` continue running undisturbed.
     ```bash
     ROBOS_VPN_LIVE_E2E=1 node --test tests/e2e/vpn-sandbox-killswitch-proof.test.cjs
     ```

## Validation

- Confirm `node --test packages/robos-lib/ovpn-providers.test.cjs` passes all unit tests.
- Confirm `proveKillSwitchOnVpnDrop()` returns `ok: true`, `ipLeakedAfterDrop: false`, `tun0DestroyedAfterKill: true`, and `droppedPacketsInKernel > 0`.
- Confirm `proveAutoFailoverOnVpnDrop()` returns `ok: true`, `appProcessSurvived: true`, and `ipLeakedDuringFailover: false`.
- Confirm `proveVpnOnlyGuard()` returns `ok: true`, `baseLaunchBlockedExitCode: 126`, `outsideSandboxKilled: true`, and `sandboxedAppSurvived: true`.
