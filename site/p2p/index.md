---
layout: default
title: RobOS P2P & Zero-Trust App Mesh — Connect RobOS Apps & Stream Media Across Machines
description: "Provider-agnostic Zero-Trust Application & IPC Port Mesh (packages/app-mesh): bridge RobOS app IPC/snapshot ports (19100–19231), stream 1080p/4K movies via HTTP 206 Byte-Range (:19215), and link Point of Sale, Smart TV Portal (:19210), and IDE bridges across machines using built-in Mutual TLS 1.3, OpenZiti, Tailscale/Headscale, NetBird, or WireGuard."
permalink: /p2p/
extra_css: /assets/blog.css
og_image: /assets/p2p/robos-p2p-app-mesh-architecture.png
og_image_alt: "RobOS App Mesh — Provider-Agnostic Zero-Trust P2P Application & IPC Port Mesh Architecture"
schema_type: TechArticle
keywords: "RobOS P2P, RobOS App Mesh, Zero-Trust App Mesh, Mutual TLS 1.3 peer pinning, OpenZiti RobOS, Tailscale Headscale, NetBird P2P, WireGuard, cross-machine IPC bridge, stream movies between RobOS PCs, HTTP 206 byte-range video streaming"
---
<section class="blog-hero">
  <div class="wrap">
    <p class="eyebrow">RobOS Zero-Trust Networking &amp; P2P App Mesh</p>
    <h1>Zero-Trust P2P App Mesh between RobOS machines</h1>
    <p class="lead">Connect any two or more RobOS computers—on the same LAN or across the internet—without opening unauthenticated ports or locking yourself into a single VPN vendor. <strong>RobOS App Mesh</strong> (<code>packages/app-mesh</code>) and <code>robos-lib/app-mesh-engine.js</code> bridge all 95+ RobOS application IPC and service ports over a cryptographic <strong>Zero-Trust Mesh</strong> using built-in <strong>Mutual TLS 1.3 + X.509 SHA-256 Peer Pinning</strong>, <strong>OpenZiti</strong>, <strong>Tailscale / Headscale</strong>, <strong>NetBird P2P</strong>, or <strong>Native WireGuard</strong>.</p>
  </div>
  <nav class="blog-jump" aria-label="Jump to P2P guide section">
    <a href="#architecture">1. Zero-Trust App Mesh Architecture</a>
    <a href="#pluggable-fabrics">2. 5 Pluggable Transport Fabrics</a>
    <a href="#pairing-and-bridging">3. Pairing Machines &amp; Bridging IPC Ports</a>
    <a href="#movie-streaming">4. Streaming Movies Across RobOS PCs</a>
    <a href="#multi-app-workflows">5. POS, Smart TVs, Dashboards &amp; IDE Bridges</a>
    <a href="#live-zt-proof">6. Live E2E Zero-Trust Cryptographic Proof</a>
  </nav>
</section>

<div class="blog-feed">

  <article class="blog-entry" id="architecture">
    <div class="blog-meta">
      <time class="blog-date" datetime="2026-10-28">Oct 28, 2026</time>
      <span class="blog-tag">RobOS App Mesh (<code>packages/app-mesh</code>)</span>
      <span class="blog-tag">Mutual TLS 1.3 (ECDSA P-256)</span>
      <span class="blog-tag">OpenZiti / Tailscale / NetBird / WireGuard</span>
      <span class="blog-tag">95+ App IPC &amp; Service Ports</span>
    </div>
    <h2><a href="#architecture">1. Why an Application-Layer Zero-Trust Mesh Instead of a Traditional LAN or OS VPN?</a></h2>
    <p class="blog-summary">By default, RobOS desktop applications bind their IPC, DOM snapshot, and service endpoints to local loopback (<code>127.0.0.1</code>) so untrusted devices on a coffee-shop, office, or home Wi-Fi network can never probe or control your apps. When you want two RobOS machines to collaborate—such as streaming a 4K movie from your home media workstation to your laptop, linking a <strong>Point of Sale</strong> self-checkout kiosk to a back-office register, or letting <strong>Agent Chat</strong> inspect a remote app's DOM snapshot—exposing raw TCP ports on <code>0.0.0.0</code> breaks zero trust. <strong>RobOS App Mesh</strong> solves this at the application layer.</p>

    <div class="blog-body">
      <figure class="blog-fig">
        <img src="{{ '/assets/p2p/robos-p2p-app-mesh-architecture.png' | relative_url }}" alt="Technical architecture diagram of RobOS App Mesh showing PC A local loopback ports, the Zero-Trust mTLS 1.3 Gateway, 5 pluggable P2P transport fabrics, rogue certificate rejection, and PC B local port bridges" loading="lazy">
        <figcaption>Architecture of <strong>RobOS App Mesh</strong> (<a href="https://github.com/nddipiazza/robos/tree/main/packages/app-mesh"><code>packages/app-mesh</code></a>) and <a href="https://github.com/nddipiazza/robos/blob/main/packages/robos-lib/app-mesh-engine.js"><code>packages/robos-lib/app-mesh-engine.js</code></a>: remote RobOS app ports are mounted onto <code>127.0.0.1</code> on peer machines over mutually authenticated TLS 1.3 tunnels.</figcaption>
      </figure>

      <pre class="mermaid">
flowchart LR
  subgraph PCA["RobOS PC A (Host / Media &amp; Dev Workstation)"]
    direction TB
    MP_A["RobOS Movie Player Stream Server<br/>127.0.0.1:19215 (HTTP 206 Byte-Range + Catalog)"]
    TV_A["Smart TV &amp; Dashboard 10-Foot Portal<br/>127.0.0.1:19210"]
    POS_A["Point of Sale Register API (:3410)<br/>IntelliJ IDEA IPC Bridge (:63343)"]
    IPC_A["90+ RobOS App IPC &amp; Snapshot Servers<br/>127.0.0.1:19100–19231"]
    GW_A["RobOS App Mesh Gateway (:19290)<br/>TLS 1.3 requestCert=true<br/>SHA-256 Cert Pinning + Per-App ACLs"]

    GW_A -->|Loopback Pipe| MP_A
    GW_A -->|Loopback Pipe| TV_A
    GW_A -->|Loopback Pipe| POS_A
    GW_A -->|Loopback Pipe| IPC_A
  end

  subgraph FABRIC["Pluggable Zero-Trust P2P Transport Fabric"]
    direction TB
    DRIVERS["1. Built-in Mutual TLS 1.3 (Zero External Daemons)<br/>2. OpenZiti Dark Overlay Fabric (ziti-edge-tunnel)<br/>3. Tailscale / Headscale WireGuard Mesh (100.x.y.z)<br/>4. NetBird WebRTC + WireGuard P2P<br/>5. Native Kernel/Userspace WireGuard (wg0)"]
    ROGUE["Unpinned / Rogue X.509 Certificate<br/>Immediate Drop: UNTRUSTED_PEER_CERTIFICATE"]
  end

  subgraph PCB["RobOS PC B (Remote Viewer / Workstation)"]
    direction TB
    BRIDGE_B["App Mesh Local Bridge Listeners<br/>127.0.0.1:19215 -> PC A :19215<br/>127.0.0.1:19210 -> PC A :19210<br/>127.0.0.1:19101 -> PC A :19101"]
    VIEW_B["RobOS Movie Player / Browser / MPV<br/>Streams 1080p/4K Movies with HTTP 206 Seeking"]
    TOOLS_B["Agent Chat / Snapshot CLI / Dashboards<br/>Talks to 127.0.0.1 as if PC A Apps Were Local"]

    VIEW_B --> BRIDGE_B
    TOOLS_B --> BRIDGE_B
  end

  BRIDGE_B <-->|Mutually Pinned TLS 1.3 Tunnel| DRIVERS
  DRIVERS <-->|Verified Peer SHA-256 Fingerprint| GW_A
  ROGUE -.->|Blocked at TLS Handshake| GW_A
      </pre>

      <h3 id="pluggable-fabrics">2. Five Pluggable Zero-Trust Transport Fabrics (No Vendor Lock-In)</h3>
      <p><strong>RobOS App Mesh</strong> never locks you into a single networking stack or external coordination service. You can switch between five transport drivers at any time from the top toolbar:</p>

      <ol>
        <li>
          <strong>Built-in Zero-Trust Mutual TLS 1.3 (<code>mtls</code> — Default, Zero Dependencies):</strong>
          <ul>
            <li>Runs 100% in Node.js / Electron user space with <strong>zero external daemons and no <code>sudo</code>/root privileges required</strong>.</li>
            <li>On first launch, each RobOS node generates an ECDSA Prime256v1 (P-256) keypair and self-signed X.509 identity certificate stored in <code>~/.config/robos/app-mesh/identity.json</code> (mode <code>0600</code>).</li>
            <li>Both the client and server enforce <code>minVersion: 'TLSv1.3'</code> and <code>requestCert: true</code>, verifying the peer's exact SHA-256 certificate fingerprint against the pinned peer registry before a single command or payload byte is forwarded.</li>
          </ul>
        </li>
        <li>
          <strong>OpenZiti Overlay Fabric (<code>openziti</code> — Identity-Based Dark Network):</strong>
          <ul>
            <li>Integrates with <code>ziti</code> and <code>ziti-edge-tunnel</code> so your RobOS machines have <strong>zero listening LAN/WAN ports</strong>.</li>
            <li>Includes a one-click <strong>OpenZiti Service Provisioning Generator</strong> that exports ready-to-run <code>ziti edge create config</code>, <code>ziti edge create service</code>, and <code>Bind</code>/<code>Dial</code> service policies for every shared RobOS IPC port (<code>robos.ipc.&lt;app-id&gt;</code>).</li>
          </ul>
        </li>
        <li>
          <strong>Tailscale / Headscale WireGuard Mesh (<code>tailscale</code>):</strong>
          <ul>
            <li>Automatically detects your machine's <code>100.x.y.z</code> Tailscale/Headscale overlay address and embeds it into your enrollment token.</li>
            <li>Generates least-privilege <strong>Tailscale/Headscale HuJSON ACL manifests</strong> (<code>tag:robos-mesh</code>) scoped strictly to your shared RobOS ports (<code>19100–19231</code>, <code>3410</code>, <code>63343</code>, <code>19290</code>).</li>
          </ul>
        </li>
        <li>
          <strong>NetBird Zero-Trust P2P (<code>netbird</code>):</strong>
          <ul>
            <li>Uses NetBird's WebRTC STUN/TURN hole-punching + WireGuard peer-to-peer tunnels to connect RobOS machines across symmetric NATs and firewalls, layered with App Mesh's per-app TLS 1.3 ACLs.</li>
          </ul>
        </li>
        <li>
          <strong>Native WireGuard Interface (<code>wireguard</code>):</strong>
          <ul>
            <li>Binds App Mesh traffic directly to a private kernel or userspace WireGuard interface (<code>wg0</code> / <code>wg-robos0</code>).</li>
          </ul>
        </li>
      </ol>

      <h3 id="pairing-and-bridging">3. Step-by-Step: Pairing Two RobOS Machines &amp; Bridging IPC Ports</h3>
      <ol>
        <li>
          <strong>Launch RobOS App Mesh on Both Machines:</strong>
          <div class="blog-log">electron packages/app-mesh</div>
        </li>
        <li>
          <strong>Exchange Zero-Trust Enrollment Tokens (<code>robos-mesh://…</code>):</strong>
          <ul>
            <li>At the top of <strong>RobOS App Mesh</strong> on <strong>PC A</strong>, click <strong>Copy Token</strong>. The token is a compact base64url-encoded JSON descriptor containing PC A's <code>nodeId</code>, LAN/Overlay IP, gateway port (<code>:19290</code>), and X.509 SHA-256 certificate fingerprint.</li>
            <li>On <strong>PC B</strong>, paste PC A's token into <strong>1. Trusted RobOS Peers → Paste Peer Enrollment Token</strong> and click <strong>Pin &amp; Trust Peer</strong>.</li>
            <li>Repeat in reverse (copy PC B's token into PC A) so both machines mutually pin each other's X.509 certificates.</li>
            <li>Click <strong>Ping mTLS</strong> next to the peer to verify a live TLS 1.3 mutual-authentication handshake.</li>
          </ul>
        </li>
        <li>
          <strong>Mount Any Remote RobOS App Port Locally:</strong>
          <ul>
            <li>In <strong>2. Cross-Machine IPC Bridges</strong>, pick your target peer (e.g., <strong>PC A</strong>) and choose any of the <strong>95+ RobOS App IPC &amp; Service Ports</strong> from the dropdown (or filter and toggle per-app permissions in Column 3).</li>
            <li>Choose a local bind port (e.g., match the standard port like <code>19215</code> or enter <code>0</code> for an automatic ephemeral port) and click <strong>Bridge IPC Port</strong>.</li>
            <li>App Mesh opens a local listener on <code>127.0.0.1:&lt;localPort&gt;</code> that transparently pipes every TCP socket through a mutually pinned TLS 1.3 connection to PC A's <code>127.0.0.1:&lt;remotePort&gt;</code>.</li>
          </ul>
        </li>
      </ol>

      <h3 id="movie-streaming">4. How to Stream Movies from One RobOS PC to Another</h3>
      <p>Once <strong>PC A</strong> (your RobOS media workstation holding your film &amp; TV library) and <strong>PC B</strong> (your laptop, bedroom PC, or office workstation) are paired in <strong>RobOS App Mesh</strong>, you have two ways to stream movies with instant seeking, TMDB/TVmaze posters, and watch-progress sync:</p>

      <h4>Method A: Bridge the Movie Player HTTP 206 Stream Server (<code>:19215</code>) via App Mesh (Zero Disk Sync)</h4>
      <p><a href="{{ '/video-player/' | relative_url }}">RobOS Movie Player</a> (<code>packages/movie-player</code>) runs a built-in HTTP Range stream and cinema catalog server on port <strong><code>19215</code></strong> (registered in App Mesh as <code>movie-player-stream</code>).</p>

      <ol>
        <li><strong>On PC A (Media Host):</strong> Open <strong>RobOS Movie Player</strong> (<code>electron packages/movie-player</code>). Its stream server starts automatically on port <code>19215</code>.</li>
        <li><strong>On PC B (Viewer PC):</strong> In <strong>RobOS App Mesh</strong> under <strong>2. Cross-Machine IPC Bridges</strong>:
          <ul>
            <li>Select <strong>Target RobOS Peer</strong>: <code>PC A</code></li>
            <li>Select <strong>Remote Port</strong>: <code>:19215 — RobOS Movie Player HTTP Range Stream &amp; Cinema Library Server (movie-player-stream)</code></li>
            <li>Set <strong>Local Bind Port</strong> to <code>19215</code> and click <strong>Bridge IPC Port</strong>.</li>
          </ul>
        </li>
        <li><strong>Watch &amp; Scrub in Real Time on PC B:</strong>
          <ul>
            <li><strong>10-Foot Cinema UI in Browser or Smart TV Portal:</strong> Bridge <code>:19210</code> (<code>smart-tv-portal</code>) as well and open <code>http://127.0.0.1:19210/movie-player</code> on PC B to browse 2:3 movie posters, TV show seasons/episodes, and play any film in full screen.</li>
            <li><strong>Direct JSON Catalog &amp; HTTP 206 Byte-Range Stream:</strong> Query PC A's catalog and play any movie URL in <strong>RobOS Movie Player</strong>, MPV, VLC, or any HTML5 video player on PC B:</li>
          </ul>
        </li>
      </ol>

      <div class="blog-log"># On PC B: 1. List movies and TV shows available on PC A over the encrypted mTLS bridge
curl -s http://127.0.0.1:19215/api/tv-library | jq '.items[] | {id, title, year, qualityBadge, streamUrl}'

# On PC B: 2. Request a playable stream URL (supports HTTP 206 Partial Content byte-range seeking)
curl -s "http://127.0.0.1:19215/api/tv-play?id=&lt;MOVIE_ID&gt;" | jq .
# Returns:
# {
#   "ok": true,
#   "id": "trk_dune_2021",
#   "title": "Dune",
#   "streamUrl": "http://127.0.0.1:19215/media/f_1_1793232900.mp4",
#   "streamFormat": "mp4",
#   "startAt": 0
# }

# On PC B: 3. Sync watch progress back to PC A so "Continue Watching" stays updated everywhere
curl -s -X POST "http://127.0.0.1:19215/api/tv-progress?id=trk_dune_2021&amp;positionSec=1840&amp;durationSec=9300"</div>

      <h4>Method B: Link PC A as an SFTP Library Folder Inside PC B's Movie Player</h4>
      <p>If you want PC A's movies and TV series to merge directly into <strong>PC B's native RobOS Movie Player library</strong> (complete with AI Watchlists, the spoken Virtual Cinema Host, and synced <code>.srt</code>/<code>.vtt</code> subtitles):</p>
      <ol>
        <li>Open <strong>RobOS Data Sources</strong> on <strong>PC B</strong> and add an <strong>SFTP connection</strong> pointing to PC A's Zero-Trust overlay IP (or a bridged SSH port) and link PC A's movies directory (e.g. <code>/home/robos/Videos</code>).</li>
        <li>Open <strong>RobOS Movie Player</strong> on <strong>PC B</strong>. As implemented in <a href="https://github.com/nddipiazza/robos/blob/main/packages/movie-player/lib/library-folders.js"><code>packages/movie-player/lib/library-folders.js</code></a>, Movie Player automatically syncs linked folders from Data Sources, indexes metadata without downloading full video files, and streams movies on demand via <code>/cloud-stream/&lt;trackId&gt;.mp4</code> with local LRU caching.</li>
      </ol>

      <h3 id="multi-app-workflows">5. Other Cross-Machine RobOS App Workflows Enabled by App Mesh</h3>
      <ul>
        <li><strong>Remote DOM Snapshots &amp; Autonomous Agent Debugging (<code>19100–19231</code>):</strong> Bridge a remote machine's app debug port (e.g., <code>dev-central</code> on <code>:19101</code> or <code>point-of-sale</code> on <code>:19202</code>) to a local port on your laptop and run <code>node packages/robos-lib/snapshot-cli.js dev-central --text --port &lt;localPort&gt;</code> or <code>--screenshot</code> over the Zero-Trust tunnel.</li>
        <li><strong>Multi-Terminal Point of Sale (<code>:3410</code>):</strong> Bridge a customer-facing self-checkout kiosk or barista prep-queue screen on Machine B to the main cash register server (<code>point-of-sale-register</code> on <code>:3410</code>) on Machine A—replacing unencrypted LAN HTTP with mutually pinned TLS 1.3.</li>
        <li><strong>Remote Wallboard Dashboards &amp; Smart TVs (<code>:19210</code>):</strong> Bridge <code>smart-tv-portal</code> (<code>:19210</code>) across offices or subnets so remote displays can render live KGraph <code>&lt;robos-dashboard&gt;</code> cards securely.</li>
        <li><strong>Remote IntelliJ IDEA IPC Bridge (<code>:63343</code>):</strong> Allow a coding agent running inside an isolated RobOS VM or remote build box to trigger breakpoints and run configurations in your local IDE over a pinned mTLS bridge.</li>
      </ul>

      <h3 id="live-zt-proof">6. Live End-to-End Zero-Trust Cryptographic Proof</h3>
      <p>Like <a href="{{ '/security/#zero-leak-vpn-app-sandbox' | relative_url }}">RobOS VPN Sandbox</a>, <strong>RobOS App Mesh</strong> includes a built-in one-click <strong>Verify Zero-Trust Proof</strong> button in the header (backed by <code>runZeroTrustVerificationProof()</code> in <a href="https://github.com/nddipiazza/robos/blob/main/packages/robos-lib/app-mesh-engine.js"><code>packages/robos-lib/app-mesh-engine.js</code></a> and the automated test suite in <a href="https://github.com/nddipiazza/robos/blob/main/packages/robos-lib/app-mesh-engine.test.cjs"><code>packages/robos-lib/app-mesh-engine.test.cjs</code></a>). It verifies three invariants live:</p>
      <ol>
        <li><strong>Unpinned / Rogue Certificate Rejection:</strong> Generates a fresh rogue ECDSA P-256 X.509 certificate not present in the trusted peer registry, connects to the TLS 1.3 Mesh Gateway, and proves the gateway immediately rejects the connection with <code>UNTRUSTED_PEER_CERTIFICATE</code> and records a <code>REJECT_UNTRUSTED_PEER</code> security audit event.</li>
        <li><strong>Mutual Enrollment between Distinct Nodes:</strong> Instantiates two separate RobOS Mesh nodes (Node A and Node B), exchanges <code>robos-mesh://</code> enrollment tokens, and verifies mutual TLS 1.3 ping authentication.</li>
        <li><strong>End-to-End Encrypted IPC Port Tunneling:</strong> Mounts Node A's IPC server onto a local bridge port on Node B and verifies that HTTP IPC requests (<code>/health</code> and <code>/snapshot</code>) traverse the encrypted TLS 1.3 tunnel intact.</li>
      </ol>

      <div class="blog-log"># Run the automated Zero-Trust App Mesh test suite
node --test packages/robos-lib/app-mesh-engine.test.cjs

# Output:
✔ getAppPortCatalog returns all registered RobOS IPC and service ports (4.74ms)
✔ AppMeshEngine runs mTLS 1.3 gateway, rejects untrusted certs, and tunnels IPC ports across two distinct nodes (284.25ms)
ℹ tests 2 | pass 2 | fail 0</div>
    </div>

    <div class="blog-links">
      <a href="https://github.com/nddipiazza/robos/tree/main/packages/app-mesh"><code>packages/app-mesh</code> source →</a>
      <a href="https://github.com/nddipiazza/robos/blob/main/packages/robos-lib/app-mesh-engine.js"><code>robos-lib/app-mesh-engine.js</code> →</a>
      <a href="https://github.com/nddipiazza/robos/blob/main/packages/robos-lib/app-mesh-engine.test.cjs">E2E Zero-Trust tunnel test →</a>
      <a href="{{ '/video-player/' | relative_url }}">RobOS Movie &amp; Video Player guide →</a>
      <a href="{{ '/security/' | relative_url }}">Security &amp; Isolation Proofs →</a>
    </div>
  </article>

</div>
