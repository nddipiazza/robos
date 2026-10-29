# RobOS Private Networks (`packages/private-networks`)

**RobOS Private Networks** links RobOS machines across completely separate networks, NATs, and cellular CGNAT boundaries using **Zero-Trust Mutual TLS 1.3** (`minVersion: 'TLSv1.3'`, X.509 SHA-256 certificate pinning, and bidirectional Reverse-Mux tunneling).

## Highlights

- **Cross-Network WAN Relay (`wss://...lhr.life`)**: 1-click zero-account SSH HTTP 101 Upgrade ingress that forwards raw encrypted Mutual TLS 1.3 streams without terminating TLS at the relay.
- **1-Step Mutual Enrollment (`robos-net://...`)**: Joining a `robos-net://` token from Box A automatically authenticates via HMAC-SHA256 `enrollProof`, pins certificates on both Box A and Box B, and opens a persistent **Bidirectional Reverse-Mux** tunnel so both machines can access each other's shared RobOS ports even across double NAT/CGNAT.
- **Cross-Machine Video Streaming (`:19215`)**: Directly bridges **RobOS Video / Movie Player** (`:19215`) between Box A and Box B with HTTP 206 byte-range seeking and automatic catalog synchronization.

## CLI Usage

```bash
# On Box B (Host / Listener behind CGNAT):
node packages/private-networks/cli.js host

# On Box A (Join Box B's Private Network & expose Box A's Movie Player :19215 to Box B):
node packages/private-networks/cli.js join "robos-net://..."
```
