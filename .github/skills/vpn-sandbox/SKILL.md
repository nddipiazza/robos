---
name: vpn-sandbox
description: Configure OpenVPN accounts and server profiles (IPVanish built-in), launch desktop or CLI executables inside isolated Linux network namespaces (ip netns) with 3-barrier iptables kill-switch enforcement, and run live E2E mid-session VPN drop kill-switch proofs.
---

# RobOS VPN Sandbox & Kill-Switch Proof

Manage OpenVPN accounts and server locations (`packages/vpn-servers`, `packages/robos-lib/ovpn-providers.js`), launch executables inside isolated Linux network namespaces (`packages/vpn-sandbox`, `packages/robos-lib/vpn-sandbox-engine.js`), and execute the 5-step live kernel E2E kill-switch proof (`tests/e2e/vpn-sandbox-killswitch-proof.test.cjs`).

## Input

`$ARGUMENTS` — Subcommand and arguments:
- `launch <executable> [args...]` — Launch an application inside an isolated `robos_vpn_<id>` network namespace routed over `tun0`
- `test-account [account-id]` — Test saved OpenVPN credentials live against TLS 1.3 + `PUSH_REPLY`
- `prove-killswitch [account-id] [profile-id]` — Run the 5-phase live kernel fault-injection proof (`proveKillSwitchOnVpnDrop`)
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

2. **Launch an Application Inside the VPN Sandbox (`robos-lib/vpn-sandbox-engine.js`)**:
   - Launch the GUI apps with `scripts/dev-launch.sh vpn-servers` or `scripts/dev-launch.sh vpn-sandbox`, or launch an executable programmatically via `launchSandboxedExecutable({ executable, args, accountId, profileId })`.
   - For browsers (`firefox`, `google-chrome-stable`, `chromium`), the engine automatically creates an isolated profile (`~/.config/robos/vpn-browser-profiles/<browser>`), passes `--no-remote --new-instance`, and wraps execution in `dbus-run-session`.

3. **Run the 5-Phase Live E2E Kill-Switch Proof**:
   - Execute the live kernel proof to verify that killing `openvpn` (`kill -9`) mid-session drops `tun0` while keeping `veth_n_<id>` up and blocks 100% of post-drop HTTPS, TCP, and UDP egress probes in the kernel (`EPERM` / `DROP`):
     ```bash
     ROBOS_VPN_LIVE_E2E=1 node --test tests/e2e/vpn-sandbox-killswitch-proof.test.cjs
     ```

## Validation

- Confirm `node --test packages/robos-lib/ovpn-providers.test.cjs` passes all unit tests.
- Confirm `proveKillSwitchOnVpnDrop()` returns `ok: true`, `ipLeakedAfterDrop: false`, `tun0DestroyedAfterKill: true`, and `droppedPacketsInKernel > 0`.
