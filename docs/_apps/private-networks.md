---
title: "RobOS Private Networks"
package: private-networks
category: "security-vault"
icon: private-networks.svg
summary: "Cross-Network Zero-Trust P2P & Relay Mesh for linking RobOS machines across separate networks/NAT/CGNAT via Mutual TLS 1.3 (robos-net://), AES-256-GCM encrypted rendezvous, bidirectional Reverse-Mux tunneling, and cross-machine RobOS Movie Player (:19215) streaming"
description: "Cross-Network Zero-Trust P2P & Relay Mesh for linking RobOS machines across separate networks/NAT/CGNAT via Mutual TLS 1.3 (robos-net://), AES-256-GCM encrypted rendezvous, bidirectional Reverse-Mux tunneling, and cross-machine RobOS Movie Player (:19215) streaming"
---

**RobOS Private Networks** (`packages/private-networks`, debug port `:19217`) links two or more RobOS machines across completely separate networks, symmetric NATs, or CGNAT with a single `robos-net://` invite token—requiring **zero cloud accounts, zero router port-forwarding, and zero root privileges**.

Built on `packages/robos-lib/app-mesh-engine.js`, every connection is end-to-end encrypted using **Mutual TLS 1.3 (`requestCert: true`)** with **ECDSA Prime256v1 (P-256) X.509 SHA-256 certificate fingerprint pinning**. Once linked, a persistent **Bidirectional Reverse-Mux** multiplexer allows both **Network A** and **Network B** to bridge each other's 95+ RobOS application IPC ports (`19100–19231`) and stream 1080p/4K video libraries directly between **RobOS Movie Player** instances (`:19215`) via HTTP 206 Byte-Range streaming.

---

## Architecture Overview

![RobOS Private Networks & Zero-Trust mTLS 1.3 Cross-Network P2P Architecture](/assets/images/private-networks-architecture.jpg)

```mermaid
flowchart LR
  subgraph NetA["Network A — Box A (robos-workstation-alpha | 10.10.1.10)"]
    direction TB
    MPA["RobOS Movie Player (:19214)<br/>& Local Stream Server (127.0.0.1:19215)"]
    TUN["Local Bridge Tunnel (127.0.0.1:19225)<br/>Mounts Box B :19215 [HTTP 206 Byte-Range]"]
    GWA["App Mesh mTLS 1.3 Gateway (:19290)<br/>ECDSA P-256 Pinning & Reverse-Mux Client"]
    MPA --> TUN
    TUN --> GWA
  end

  subgraph Fabric["Cross-Network Zero-Trust Fabric (NAT / CGNAT Traversal)"]
    direction TB
    RELAY["Self-Healing WAN Relay Ingress<br/>wss://&lt;relay-id&gt;.lhr.life &rarr; HTTP 101 Upgrade<br/>Forwards Raw Encrypted TLS 1.3 Bytes"]
    RV["Zero-Knowledge Rendezvous Discovery<br/>HMAC-SHA256 Opaque Topic + AES-256-GCM Beacon<br/>+ 20s Active Relay Health Probe"]
    MUX["Bidirectional Reverse-Mux Multiplexer<br/>Multiplexes Inbound & Outbound Streams<br/>Over Single Authenticated mTLS 1.3 Socket"]
  end

  subgraph NetB["Network B — Box B (robos-media-vault-beta | 10.20.2.20)"]
    direction TB
    UPG["HTTP 101 Upgrade Bridge +<br/>App Mesh mTLS 1.3 Gateway (:19290)"]
    MPB["RobOS Movie Player Stream Server (127.0.0.1:19215)<br/>Cinema Catalog (/api/tv-library) + HTTP 206 Media"]
    IPCB["95+ Shared RobOS App IPC & Service Ports<br/>19100–19231, :3410 POS, :19210 Smart TV, :63343 IDE"]
    UPG --> MPB
    UPG --> IPCB
  end

  GWA <-->|End-to-End Mutual TLS 1.3| RELAY
  RELAY <-->|Raw TLS 1.3 Passthrough| UPG
  GWA <.->|Decrypts Rotated Relay URL| RV
  UPG <.->|Publishes AES-256-GCM Beacon| RV
  GWA <-->|Bidirectional Stream Framing| MUX
  MUX <-->|Reverse-Dial Across CGNAT| UPG
```

---

## Key Capabilities

### 1. 1-Step Mutual Enrollment (`robos-net://`)
A single `robos-net://` token contains the host node's random cryptographic `nodeId`, gateway port, optional WAN relay URL, X.509 SHA-256 certificate fingerprint, and a secret `enrollToken`. When Box A runs `join`:
1. Box A pins Box B's X.509 SHA-256 fingerprint locally.
2. Box A dials Box B over TLS 1.3 (`minVersion: 'TLSv1.3'`) and presents `enrollProof = HMAC-SHA256(enrollToken, nodeIdA + ":" + fingerprintA)`.
3. Box B verifies `enrollProof` in constant time (`crypto.timingSafeEqual`) and automatically pins Box A's client certificate—completing mutual enrollment in a single round-trip.

### 2. Self-Healing WAN Relay & Zero-Knowledge `AES-256-GCM` Rendezvous
When two RobOS machines sit on separate networks behind NAT or CGNAT without a shared overlay VPN:
- **End-to-End TLS 1.3 over HTTP 101 Upgrade (`ensureUpgradeBridgeServer`)**: The host starts a lightweight local HTTP 101 WebSocket Upgrade bridge in front of its TLS 1.3 gateway and allocates an outbound SSH relay (`wss://<relay-id>.lhr.life`). The relay only forwards raw TCP frames; **Mutual TLS 1.3 terminates strictly inside the RobOS gateway**.
- **20-Second Self-Healing Health Probe (`probeRelayHttpAlive`)**: Continuously probes the relay ingress and automatically respawns a fresh tunnel if the upstream relay drops or rotates its subdomain (`HTTP 502`).
- **Zero-Knowledge `AES-256-GCM` Rendezvous Discovery (`publishRendezvousBeacon` / `resolveLatestRendezvousRelay`)**: Whenever a relay subdomain rotates, the host publishes an `AES-256-GCM` encrypted beacon (`{ v: 2, iv, tag, ct }`) to an unguessable topic derived via `HMAC-SHA256(enrollToken, "robos-rv-topic:" + nodeId)`. No hostnames, LAN/Overlay IPs, node IDs, or plaintext relay URLs are ever exposed on the rendezvous channel.

### 3. Bidirectional `Reverse-Mux` Stream Multiplexing
Because Box A may also be behind strict NAT/CGNAT, `joinPrivateNetwork` automatically opens a persistent `reverse-mux` session (`attachStreamMux`) over the authenticated TLS 1.3 socket. Using a compact 9-byte binary frame protocol (`OPEN`, `DATA`, `CLOSE`, `PING`), Box B can dial Box A's local ports (`:19215` Movie Player, `:19100–19231` App IPC) back through Box A's outbound connection.

### 4. Cross-Network Movie Player Streaming (`:19215` &rarr; `:19225`)
Linking two machines automatically mounts the remote peer's **RobOS Movie Player** stream server (`:19215`) onto local port `127.0.0.1:19225` and writes `~/.config/robos/movie-player/active-peer-bridge.json`.
- **RobOS Movie Player** (`packages/movie-player`) auto-detects the active bridge (or lets you click **`+ P2P Peer`** in the Library Folders panel), imports the remote peer's video catalog (`/api/tv-library?all=1`), rewrites media URLs to `http://127.0.0.1:19225/media/...`, and streams 1080p/4K `.mp4`, `.mkv`, and `.webm` files with instant `HTTP 206 Partial Content` byte-range seeking.

---

## CLI & Desktop Usage

```bash
# 1. On Box B (Host): Start the Zero-Trust mTLS 1.3 Gateway, local :19215 video server, and WAN Relay
node packages/private-networks/cli.js host

# 2. On Box A (Remote Peer): Join Box B's Private Network and mount its video library on 127.0.0.1:19225
node packages/private-networks/cli.js join "robos-net://<INVITE_TOKEN>"

# 3. Query Box B's video catalog and test HTTP 206 byte-range streaming over the local mTLS bridge
curl -s "http://127.0.0.1:19225/api/tv-library?all=1" | jq .
curl -I -H "Range: bytes=0-65535" "http://127.0.0.1:19225/media/<STREAM_FILE>.webm"

# 4. Launch the Desktop GUIs
electron packages/private-networks
electron packages/movie-player
```
