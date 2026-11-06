# RobOS App Mesh (`packages/app-mesh`)

**RobOS App Mesh** is a provider-agnostic Zero-Trust Application & IPC Port Mesh that securely opens and bridges all RobOS application IPC/snapshot ports (`19100–19231`) and service ports (Point of Sale `:3410`, Smart TV / Dashboards `:19210`, Party Game `:19213`, IntelliJ IDEA Bridge `:63343`) from one RobOS machine to another—whether on the same LAN or across different networks.

## Pluggable Zero-Trust Transport Fabrics

Instead of locking you into a single vendor or daemon, **RobOS App Mesh** supports 5 pluggable transport fabrics via `packages/robos-lib/app-mesh-engine.js`:

1. **Built-in Zero-Trust mTLS 1.3 (`mtls`)** — Pure Node.js Mutual TLS 1.3 with ECDSA P-256 X.509 peer certificate SHA-256 fingerprint pinning and per-app ACLs. Requires zero external daemons or root privileges.
2. **OpenZiti Overlay Fabric (`openziti`)** — Generates dark-network OpenZiti service/intercept definitions (`robos.ipc.<app-id>`) and integrates with `ziti` / `ziti-edge-tunnel`.
3. **Tailscale / Headscale Mesh (`tailscale`)** — Routes RobOS IPC tunnels over authenticated `100.x.y.z` WireGuard overlay peers and exports least-privilege HuJSON ACLs.
4. **NetBird Zero-Trust P2P (`netbird`)** — Connects RobOS machines across NAT via NetBird WebRTC + WireGuard P2P tunnels.
5. **Native WireGuard (`wireguard`)** — Binds RobOS IPC mesh traffic to `wg0` / `wg-robos0`.

## Scoped invites (share one app, not the whole machine)

A `robos-net://` network token carries the network-wide enroll secret, and machines that join with it get access to every shared port. To share just one service, an app creates a **scoped invite** instead:

```js
const { token, invite } = engine.createScopedInvite({ allowedAppIds: ['camera-watch-share'], label: 'For my neighbour' });
// on the other machine:
await engine.joinPrivateNetwork(token, { reverseMux: false, peerAccess: { allowAllApps: false, allowedAppIds: ['camera-watch-share'] } });
```

- The invite has its own enroll token; whoever joins with it is pinned with `allowedAppIds` set to the invite's apps only. Joining again never widens access.
- `peerAccess` limits what the inviting machine may reach on the joining one.
- `connect` checks the ACL against the app that owns the port actually dialed, so naming an allowed app with another port is denied.
- `revokeInvite(id)` removes the machines that joined with it; `removePeer` closes that peer's open connections and reverse-mux right away.

RobOS Camera Watch uses this to share cameras (`camera-watch-share`, `:19221`).

## Running

```bash
electron packages/app-mesh
```
