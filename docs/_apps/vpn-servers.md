---
title: "RobOS VPN Servers"
package: vpn-servers
category: "security-vault"
icon: vpn-servers.svg
summary: "Manage OpenVPN providers (IPVanish built-in with 3,598 server profiles), encrypted VPN accounts, live TLS 1.3 credential tests, and server locations."
description: "Configure OpenVPN accounts (IPVanish, ProtonVPN, Mullvad, NordVPN, or custom .ovpn), test credentials live against OpenVPN PUSH_REPLY, and browse 3,598 bundled IPVanish server locations."
related:
  - /security/
  - /apps/vpn-sandbox/
  - /apps/pass-manager/
  - /apps/robos-preferences/
---

**RobOS VPN Servers** (`packages/vpn-servers`, window title **VPN Servers & Accounts**) manages the OpenVPN providers, encrypted account credentials, and `.ovpn` server profiles used by [RobOS VPN Sandbox]({{ '/apps/vpn-sandbox/' | relative_url }}) and [RobOS Preferences]({{ '/apps/robos-preferences/' | relative_url }}).

![RobOS VPN Servers Verified]({{ '/assets/images/security/vpn-servers-verified.png' | relative_url }})

## Key Capabilities

1. **Built-In IPVanish Provider with 3,598 Official `.ovpn` Server Profiles**:
   - Ships with all **3,598** official IPVanish `.ovpn` server configurations and `ca.ipvanish.com.crt` (`packages/robos-lib/assets/ipvanish-configs.tar.xz`), pre-sanitized for OpenVPN 2.6/2.7 compatibility (`data-ciphers AES-256-GCM:AES-128-GCM:CHACHA20-POLY1305:AES-256-CBC` and removal of deprecated `keysize` directives).
   - Includes a one-click **Refresh IPVanish Servers** button to pull the latest `configs.zip` catalog from `https://configs.ipvanish.com/configs/`, plus **Import .ovpn File…** for custom OpenVPN profiles.
2. **Encrypted Credential Storage (Never Plaintext)**:
   - Account metadata is stored in `~/.config/robos/ovpn-accounts.json` while passwords are stored encrypted in [Pass Manager]({{ '/apps/pass-manager/' | relative_url }}) (`robos/ovpn/<provider>/<account>`) with an automatic AES-256-GCM local vault fallback (`~/.config/robos/ovpn/.vault/`) when `pass` is not initialized.
   - Includes a **Show / Hide** toggle on the OpenVPN password field for easy entry and verification of service credentials.
3. **Live OpenVPN Credential & Tunnel Handshake Verification (`Test` Button)**:
   - Click **Test** on any saved account card or **Test Connection** in the account form to perform a live OpenVPN TLS 1.3 handshake (`--auth-user-pass`, `--connect-retry-max 1`) against the selected server profile and verify `PUSH_REPLY` along with the assigned VPN tunnel IP and negotiated cipher.
4. **Country & City Filtering Across 3,600+ Locations**:
   - Filter server profiles by country (`All Countries`, `US`, `NL`, `GB`, `DE`, etc.) or search by city, region, or hostname (`atl-a01`, `nyc`, `ams`), and click **Use Server** to set the active default server for your account.

## Run it

Launch **RobOS VPN Servers** from the desktop, from the **VPN Servers & Accounts…** button inside [RobOS VPN Sandbox]({{ '/apps/vpn-sandbox/' | relative_url }}), or run:

```bash
scripts/dev-launch.sh vpn-servers
```
