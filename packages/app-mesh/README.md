# RobOS App Mesh (`packages/app-mesh`)

**RobOS App Mesh** is a provider-agnostic Zero-Trust Application & IPC Port Mesh that securely opens and bridges all RobOS application IPC/snapshot ports (`19100–19231`) and service ports (Point of Sale `:3410`, Smart TV / Dashboards `:19210`, Party Game `:19213`, IntelliJ IDEA Bridge `:63343`) from one RobOS machine to another—whether on the same LAN or across different networks.

## Pluggable Zero-Trust Transport Fabrics

Instead of locking you into a single vendor or daemon, **RobOS App Mesh** supports 5 pluggable transport fabrics via `packages/robos-lib/app-mesh-engine.js`:

1. **Built-in Zero-Trust mTLS 1.3 (`mtls`)** — Pure Node.js Mutual TLS 1.3 with ECDSA P-256 X.509 peer certificate SHA-256 fingerprint pinning and per-app ACLs. Requires zero external daemons or root privileges.
2. **OpenZiti Overlay Fabric (`openziti`)** — Generates dark-network OpenZiti service/intercept definitions (`robos.ipc.<app-id>`) and integrates with `ziti` / `ziti-edge-tunnel`.
3. **Tailscale / Headscale Mesh (`tailscale`)** — Routes RobOS IPC tunnels over authenticated `100.x.y.z` WireGuard overlay peers and exports least-privilege HuJSON ACLs.
4. **NetBird Zero-Trust P2P (`netbird`)** — Connects RobOS machines across NAT via NetBird WebRTC + WireGuard P2P tunnels.
5. **Native WireGuard (`wireguard`)** — Binds RobOS IPC mesh traffic to `wg0` / `wg-robos0`.

## Running

```bash
electron packages/app-mesh
```
