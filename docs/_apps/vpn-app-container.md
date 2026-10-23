---
title: "RobOS VPN App Container"
package: vpn-app-container
category: "security-vault"
icon: vpn-app-container.svg
summary: "Run selected applications with VPN-only networking and automatic termination on VPN failure"
description: "Run selected applications with VPN-only networking and automatic termination on VPN failure"
---

Launch a separate copy of qBittorrent or Transmission with a VPN-only network
boundary. Import an IPVanish OpenVPN profile, enter credentials locally, and launch
the selected app after VPN connectivity passes. A Linux Docker engine is required.

The container blocks direct app internet traffic and IPv6. Its supervisor kills the
app process group on detected tunnel or connectivity failure. Detection has finite
latency; firewall rules enforce the boundary during that interval. Existing host
installations do not inherit this protection.

Use **Build app container**, import the profile and adjacent CA certificate, then
**Launch with VPN protection**. When status is `running`, **Open app** opens the
local Web UI. Its generated login appears in the launcher. **Stop container**
terminates it while retaining downloads and preferences.

The initial implementation has controller and supervisor tests. Live qBittorrent
network isolation and VPN failure tests require a Linux runtime and VPN credentials;
they have not been executed on the Windows development host. See the package README
for the live test and the pending KGraph registration request.
