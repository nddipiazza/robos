---
title: "RobOS App Mesh"
package: app-mesh
category: "security-vault"
icon: app-mesh.svg
summary: "Zero-Trust App & IPC Port Mesh for connecting RobOS applications across machines (mTLS 1.3, OpenZiti, Tailscale, NetBird, WireGuard)"
description: "Zero-Trust App & IPC Port Mesh for connecting RobOS applications across machines (mTLS 1.3, OpenZiti, Tailscale, NetBird, WireGuard)"
---

**RobOS App Mesh** creates a private, provider-agnostic Zero-Trust network specifically for RobOS applications and their IPC/service ports across machines—whether on the same LAN or across different networks.

## Key Capabilities

- **Provider-Agnostic Transport Fabrics**:
  - **Built-in Zero-Trust mTLS 1.3 (`mtls`)**: Pure Node.js Mutual TLS 1.3 with X.509 ECDSA P-256 peer certificate SHA-256 fingerprint pinning. Works out of the box with zero external daemons or root privileges.
  - **OpenZiti Overlay Fabric (`openziti`)**: Dark-network service/intercept configuration generator (`robos.ipc.<app-id>`) and edge tunnel integration.
  - **Tailscale / Headscale (`tailscale`)**: WireGuard overlay mesh routing and least-privilege HuJSON ACL export.
  - **NetBird Zero-Trust P2P (`netbird`)**: WebRTC + WireGuard NAT-traversal P2P mesh support.
  - **Native WireGuard (`wireguard`)**: Dedicated `wg0` / `wg-robos0` interface binding.
- **Full RobOS App IPC & Service Port Catalog**: Bridges all registered RobOS DOM Snapshot / IPC ports (`19100–19231`) plus service ports (Point of Sale `:3410`, Smart TV & Dashboards `:19210`, Party Game `:19213`, and IntelliJ IDEA IPC `:63343`) with per-app allow/block ACL toggles.
- **1-Click Live Zero-Trust Proof**: Built-in cryptographic verification that proves unpinned rogue certificates are rejected while authorized peer IPC tunnels pass `/health` and `/snapshot` traffic over TLS 1.3.
