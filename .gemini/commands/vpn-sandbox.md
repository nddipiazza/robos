# RobOS VPN Sandbox & Kill-Switch Proof

Configure OpenVPN accounts and server profiles (`packages/vpn-servers`), launch executables inside isolated Linux network namespaces (`packages/vpn-sandbox`), and run the live 5-step E2E mid-session VPN drop kill-switch proof.

## Usage
- Run unit tests: `node --test packages/robos-lib/ovpn-providers.test.cjs`
- Run live kernel E2E kill-switch proof: `ROBOS_VPN_LIVE_E2E=1 node --test tests/e2e/vpn-sandbox-killswitch-proof.test.cjs`
- Launch GUI apps: `scripts/dev-launch.sh vpn-servers` and `scripts/dev-launch.sh vpn-sandbox`
