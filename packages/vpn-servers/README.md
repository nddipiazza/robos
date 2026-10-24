# RobOS VPN Servers (`packages/vpn-servers`)

**RobOS VPN Servers** (window title **VPN Servers & Accounts**) manages OpenVPN providers, encrypted VPN account credentials, and server locations across RobOS.

## Features
- **Built-In IPVanish Provider with 3,598 Server Profiles**: Includes all 3,598 official IPVanish `.ovpn` configurations (`packages/robos-lib/assets/ipvanish-configs.tar.xz`) pre-sanitized for OpenVPN 2.6/2.7 compatibility, plus one-click refresh from `https://configs.ipvanish.com/configs/` and custom `.ovpn` import.
- **Encrypted Credential Storage**: Stores account metadata in `~/.config/robos/ovpn-accounts.json` and encrypts passwords in `pass` (`robos/ovpn/<provider>/<account>`) with an automatic AES-256-GCM local vault fallback. Includes a **Show / Hide** password toggle.
- **Live OpenVPN Handshake Verification (`Test` Button)**: Verifies account credentials live against OpenVPN TLS 1.3 + `PUSH_REPLY` and reports the assigned tunnel IP and cipher.
- **Country & City Filter**: Filter 3,600+ server locations by country or search by city/hostname.

## Launch & Test
```bash
scripts/dev-launch.sh vpn-servers
node --test packages/robos-lib/ovpn-providers.test.cjs
```
