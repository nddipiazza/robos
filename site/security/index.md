---
layout: default
title: Security & Isolation Proofs
description: "End-to-end verified security architectures, network namespace sandboxes, kernel kill-switch proofs, and zero-leak audits in RobOS."
permalink: /security/
extra_css: /assets/blog.css
og_image: /assets/security/vpn-sandbox-killswitch-proven.png
og_image_alt: "RobOS Security — Live 5-Step Kernel Kill-Switch Proof for OpenVPN App Sandbox"
schema_type: TechArticle
keywords: "RobOS security, OpenVPN network namespace sandbox, ip netns kill switch, iptables UID owner lock, IPVanish Linux sandbox, E2E zero-leak proof"
---
<section class="blog-hero">
  <div class="wrap">
    <p class="eyebrow">RobOS Security</p>
    <h1>Security &amp; isolation proofs</h1>
    <p class="lead">Architectural isolation boundaries in RobOS—each backed by live kernel state inspection, automated end-to-end fault-injection tests, and captured evidence.</p>
  </div>
  <nav class="blog-jump" aria-label="Jump to security entry">
    <a href="#zero-leak-vpn-app-sandbox">Zero-Leak OpenVPN App Sandbox &amp; Kill-Switch Proof</a>
  </nav>
</section>

<div class="blog-feed">

  <article class="blog-entry" id="zero-leak-vpn-app-sandbox">
    <div class="blog-meta">
      <time class="blog-date" datetime="2026-10-24">Oct 24, 2026</time>
      <span class="blog-tag">Network Namespace (`ip netns`)</span>
      <span class="blog-tag">OpenVPN 2.7 / IPVanish</span>
      <span class="blog-tag">3-Barrier Kernel Kill-Switch</span>
      <span class="blog-tag">Live E2E Proof</span>
    </div>
    <h2><a href="#zero-leak-vpn-app-sandbox">Zero-Leak OpenVPN App Sandbox: Proving an App Never Leaks Your Real IP When the VPN Drops</a></h2>
    <p class="blog-summary"><strong>RobOS VPN Servers</strong> and <strong>RobOS VPN Sandbox</strong> let you bind individual Linux desktop applications (such as Firefox, Transmission, or CLI tools) to an OpenVPN provider (with 3,598 built-in IPVanish server profiles) inside a dedicated Linux network namespace (<code>ip netns</code>). Even if the OpenVPN daemon crashes or is force-killed (<code>SIGKILL</code>) mid-session while the app is actively transmitting, three independent kernel barriers prevent the app from ever falling back to your normal public IP.</p>

    <div class="blog-body">
      <figure class="blog-fig">
        <img src="{{ '/assets/security/vpn-sandbox-killswitch-proven.png' | relative_url }}" alt="RobOS VPN Sandbox showing Firefox running inside an isolated VPN namespace and the live 5-step Kill-Switch Proof banner" loading="lazy">
        <figcaption>E2E capture of <strong>RobOS VPN Sandbox</strong> on Ubuntu 26.04 LTS: Firefox is confined to an isolated namespace routing through IPVanish Atlanta (<code>216.131.74.203</code>) while the normal public IP (<code>105.42.88.19</code>) is blocked, and the top banner reports the live 5-step mid-session OpenVPN drop kill-switch proof.</figcaption>
      </figure>

      <div class="blog-fig-grid">
        <figure class="blog-fig">
          <img src="{{ '/assets/security/vpn-servers-verified.png' | relative_url }}" alt="RobOS VPN Servers showing live OpenVPN account credential verification and 3,598 IPVanish server profiles" loading="lazy">
          <figcaption><strong>RobOS VPN Servers</strong>: GPG/AES-256-GCM encrypted account credentials tested live against OpenVPN TLS 1.3 + <code>PUSH_REPLY</code>, paired with 3,598 bundled IPVanish server profiles filterable by country and city.</figcaption>
        </figure>
        <figure class="blog-fig">
          <img src="{{ '/assets/security/vpn-sandbox-running.png' | relative_url }}" alt="RobOS VPN Sandbox showing an active Firefox session routed over tun0 with the host normal public IP blocked" loading="lazy">
          <figcaption><strong>RobOS VPN Sandbox</strong>: Launching an application creates an ephemeral <code>robos_vpn_&lt;id&gt;</code> namespace, verifies external exit IP over <code>tun0</code> before starting the binary, and isolates browser profiles and D-Bus sessions.</figcaption>
        </figure>
      </div>

      <h3>Why Traditional OS-Wide VPNs Leak When OpenVPN Stops</h3>
      <p>On a standard desktop VPN setup, OpenVPN installs split default routes (<code>0.0.0.0/1</code> and <code>128.0.0.0/1</code>) over <code>tun0</code> on top of the host's primary default route (<code>0.0.0.0/0 via 192.168.1.1 dev enp2s0</code>). If the OpenVPN process crashes or drops the tunnel interface, the kernel automatically removes the <code>/1</code> routes on <code>tun0</code> and immediately routes in-flight sockets over the underlying host interface—exposing the user's real public IP.</p>

      <h3>The 3-Barrier Kernel Architecture</h3>
      <p>Instead of sharing the host network stack, <strong>RobOS VPN Sandbox</strong> (<a href="https://github.com/nddipiazza/robos/blob/main/packages/robos-lib/vpn-sandbox-engine.js"><code>packages/robos-lib/vpn-sandbox-engine.js</code></a>) constructs a per-application network namespace (<code>robos_vpn_&lt;id&gt;</code>) where physical interfaces do not exist and enforces three independent kernel firewall barriers:</p>

      <figure class="blog-fig">
        <img src="{{ '/assets/security/vpn-killswitch-architecture.png' | relative_url }}" alt="Technical architecture diagram of the RobOS Zero-Leak OpenVPN Network Namespace Sandbox and 3-Barrier Kernel Kill-Switch" loading="lazy">
        <figcaption>Technical schematic of the 3-Barrier Linux Kernel Kill-Switch inside <code>robos_vpn_&lt;id&gt;</code>.</figcaption>
      </figure>

      <pre class="mermaid">
flowchart LR
  subgraph NS["Isolated Linux Network Namespace (robos_vpn_25db)"]
    APP["Sandboxed App (Firefox / Transmission)<br/>uid=1000, CAP_NET_ADMIN stripped"]
    DNS["Namespace DNS &amp; NSS<br/>/etc/netns/robos_vpn_25db/resolv.conf<br/>nsswitch.conf: hosts: files dns"]
    IPT_NS["Barrier 1: In-Namespace iptables OUTPUT<br/>Policy: DROP<br/>1. -o lo ACCEPT<br/>2. -o tun+ ACCEPT<br/>3. -o veth_n_25db -d 216.131.74.202:443/udp -m owner --uid-owner 0 ACCEPT<br/>4. -o veth_n_25db DROP (blocks uid 1000 -> EPERM)"]
    OVPN["OpenVPN 2.7 Daemon<br/>uid=0 (--dns-updown disable)"]
    TUN0["tun0 (172.21.23.221)"]
    VETH_N["veth_n_25db (10.203.41.2/30)"]

    APP --> DNS
    APP -->|Allowed when tun0 UP| TUN0
    TUN0 --> OVPN
    OVPN -->|uid=0 encrypted UDP:443| IPT_NS
    APP -.->|When tun0 DOWN: falls back to default route| IPT_NS
    IPT_NS -->|uid=0 ONLY to 216.131.74.202:443| VETH_N
  end

  subgraph HOST["Host Kernel (enp2s0 — Normal Public IP 105.42.88.19)"]
    VETH_H["veth_h_25db (10.203.41.1/30)"]
    IPT_FWD["Barrier 2: Host FORWARD Chain (ROBOS_VPN_FWD_25db)<br/>ACCEPT only 10.203.41.2 -> 216.131.74.202:443/udp<br/>DROP all other packets from veth_h_25db"]
    IPT_NAT["Barrier 3: Host NAT POSTROUTING<br/>MASQUERADE only -s 10.203.41.2 -d 216.131.74.202:443/udp<br/>No NAT rule exists for any other destination"]
    VETH_N --> VETH_H
    VETH_H --> IPT_FWD
    IPT_FWD --> IPT_NAT
  end

  subgraph EXT["External Internet"]
    VPNSRV["IPVanish Server (atl-a01)<br/>216.131.74.202:443/udp<br/>Exit IP: 216.131.74.203"]
    REALIP["Direct Host Egress (105.42.88.19)<br/>UNREACHABLE FROM SANDBOX"]
    IPT_NAT -->|Encrypted OpenVPN Carrier| VPNSRV
    IPT_FWD -.->|0 packets allowed| REALIP
  end
      </pre>

      <ol>
        <li><strong>Barrier 1 — In-Namespace <code>iptables</code> Default-DROP + UID Owner Lock:</strong> The target application is spawned as the unprivileged desktop user (<code>uid 1000</code>) with <code>setpriv --inh-caps=-net_admin,-net_raw</code> so it can never alter routes or firewall rules. Inside <code>robos_vpn_&lt;id&gt;</code>, <code>iptables -P OUTPUT DROP</code> and <code>ip6tables -P OUTPUT DROP</code> drop all traffic by default. Only <code>-o tun+</code> is open to <code>uid 1000</code>. On the carrier link <code>veth_n_&lt;id&gt;</code>, only <code>-m owner --uid-owner 0</code> (the root OpenVPN daemon) destined to the exact VPN server IP and port (<code>216.131.74.202:443/udp</code>) is accepted, followed immediately by <code>-A OUTPUT -o veth_n_&lt;id&gt; -j DROP</code>. When <code>openvpn</code> stops and <code>tun0</code> vanishes, any packet sent by the app is routed toward <code>veth_n_&lt;id&gt;</code> and immediately rejected by the kernel with <code>EPERM</code>.</li>
        <li><strong>Barrier 2 — Host Kernel <code>FORWARD</code> Chain Lock (<code>ROBOS_VPN_FWD_&lt;id&gt;</code>):</strong> On the host side of the virtual Ethernet cable (<code>veth_h_&lt;id&gt;</code>), a dedicated chain inserted at <code>FORWARD 1</code> only permits packets from <code>10.203.X.2/32</code> to <code>&lt;vpn_server_ip&gt;/32:&lt;vpn_port&gt;</code> and unconditionally <code>DROP</code>s all other traffic from <code>veth_h_&lt;id&gt;</code> before NAT.</li>
        <li><strong>Barrier 3 — Destination-Scoped Host <code>POSTROUTING</code> NAT:</strong> The host <code>MASQUERADE</code> rule is scoped strictly to <code>-s 10.203.X.2/32 -d &lt;vpn_server_ip&gt;/32 -p udp --dport 443</code>. Even if <code>FORWARD</code> did not exist, the host kernel has no NAT translation rule to masquerade <code>10.203.X.2</code> onto the normal public IP for any other destination.</li>
      </ol>

      <h3>Live 5-Phase End-to-End Kill-Switch Proof</h3>
      <p>To prove that stopping OpenVPN mid-session never exposes the host's real IP, the automated E2E test suite (<a href="https://github.com/nddipiazza/robos/blob/main/tests/e2e/vpn-sandbox-killswitch-proof.test.cjs"><code>tests/e2e/vpn-sandbox-killswitch-proof.test.cjs</code></a>) executes <code>proveKillSwitchOnVpnDrop()</code> against the live Linux kernel:</p>

      <ol>
        <li><strong>Phase 1 — Host Baseline:</strong> Queries <code>https://api.ipify.org</code> on the host outside the sandbox and records the real public IP (<code>105.42.88.19</code>).</li>
        <li><strong>Phase 2 — In-Namespace Egress While OpenVPN (<code>tun0</code>) is UP:</strong> Starts an isolated namespace (<code>robos_vpn_25db</code>) connected to IPVanish Atlanta (<code>atl-a01.ipvanish.com</code>). Running inside <code>robos_vpn_25db</code> as unprivileged user <code>uid 1000</code> with <code>CAP_NET_ADMIN</code> stripped, the test queries <code>https://api.ipify.org</code> and verifies the returned IP is the VPN exit IP (<code>216.131.74.203</code>, tunnel IP <code>172.21.23.221</code>) and never <code>105.42.88.19</code>.</li>
        <li><strong>Phase 3 — Force-Kill OpenVPN Mid-Flight (<code>kill -9</code>):</strong> Sends <code>SIGKILL</code> to the OpenVPN daemon inside <code>robos_vpn_25db</code> while leaving the namespace, the running app, and the fallback default route (<code>default via 10.203.41.1 dev veth_n_25db</code>) up. Verifies <code>tun0</code> is destroyed.</li>
        <li><strong>Phase 4 — 4 Post-Kill Egress Probes from the Running App:</strong> With <code>tun0</code> gone and the <code>veth_n_25db</code> default route active, the unprivileged app inside <code>robos_vpn_25db</code> attempts four distinct egress connections:
          <ul>
            <li><strong>Probe A (HTTPS IP Check):</strong> <code>GET https://api.ipify.org</code> → <code>leaked: false</code> (blocked: <code>EAI_AGAIN</code>, UDP DNS packets dropped).</li>
            <li><strong>Probe B (Direct TCP to Public IP):</strong> <code>net.connect('1.1.1.1', 80)</code> bypassing DNS → <code>leaked: false</code> (blocked: <code>ETIMEDOUT</code>, TCP SYN packets dropped).</li>
            <li><strong>Probe C (Direct UDP DNS Packet):</strong> <code>dgram.send('8.8.8.8', 53)</code> → <code>leaked: false</code> (blocked immediately by kernel: <code>EPERM</code>).</li>
            <li><strong>Probe D (Direct UDP to Whitelisted VPN Server IP as App UID):</strong> <code>dgram.send('216.131.74.202', 443)</code> as <code>uid 1000</code> → <code>leaked: false</code> (blocked immediately by kernel: <code>EPERM</code> because <code>-m owner --uid-owner 0</code> only allows <code>uid 0</code>).</li>
          </ul>
        </li>
        <li><strong>Phase 5 — Kernel <code>iptables</code> Packet Counter Proof:</strong> Inspects <code>ip netns exec robos_vpn_25db iptables -L OUTPUT -v -n -x</code> and verifies that <code>14</code> packets (<code>1,070</code> bytes) were intercepted and dropped by <code>-A OUTPUT -o veth_n_25db -j DROP</code>, with <code>0</code> packets leaking to <code>105.42.88.19</code>.</li>
      </ol>

      <div class="blog-log"># Run the live kernel E2E kill-switch proof
ROBOS_VPN_LIVE_E2E=1 node --test tests/e2e/vpn-sandbox-killswitch-proof.test.cjs

# Output from Ubuntu 26.04 LTS verification host:
{
  "ok": true,
  "mode": "live-kernel-proof",
  "netnsName": "robos_vpn_25db",
  "normalPublicIp": "105.42.88.19",
  "vpnExitIpBeforeDrop": "216.131.74.203",
  "tunnelIpBeforeDrop": "172.21.23.221",
  "tun0DestroyedAfterKill": true,
  "vethDefaultRouteStillUp": true,
  "nsRoutesAfterKill": "default via 10.203.41.1 dev veth_n_25db \n10.203.41.0/30 dev veth_n_25db proto kernel scope link src 10.203.41.2 \n216.131.74.202 via 10.203.41.1 dev veth_n_25db",
  "probeResults": {
    "httpsIpify": { "leaked": false, "blockedError": "EAI_AGAIN" },
    "tcpDirect": { "leaked": false, "blockedError": "ETIMEDOUT" },
    "udpDnsDirect": { "leaked": false, "blockedError": "EPERM" },
    "udpVpnServerAsAppUid": { "leaked": false, "blockedError": "EPERM" }
  },
  "ipLeakedAfterDrop": false,
  "droppedPacketsInKernel": 14,
  "iptablesOutputTable": "Chain OUTPUT (policy DROP 0 packets, 0 bytes)\n    pkts      bytes target     prot opt in     out     source               destination         \n       0        0 ACCEPT     all  --  *      lo      0.0.0.0/0            0.0.0.0/0           \n      19     2090 ACCEPT     all  --  *      tun+    0.0.0.0/0            0.0.0.0/0           \n      28     5694 ACCEPT     udp  --  *      veth_n_25db  0.0.0.0/0            216.131.74.202       udp dpt:443 owner UID match 0\n      14     1070 DROP       all  --  *      veth_n_25db  0.0.0.0/0            0.0.0.0/0"
}</div>
    </div>

    <div class="blog-links">
      <a href="{{ '/v1/apps/vpn-sandbox/' | relative_url }}">RobOS VPN Sandbox app page →</a>
      <a href="{{ '/v1/apps/vpn-servers/' | relative_url }}">RobOS VPN Servers app page →</a>
      <a href="https://github.com/nddipiazza/robos/blob/main/tests/e2e/vpn-sandbox-killswitch-proof.test.cjs">E2E Kill-Switch Proof test source →</a>
      <a href="https://github.com/nddipiazza/robos/blob/main/packages/robos-lib/vpn-sandbox-engine.js">Sandbox Engine source →</a>
      <span class="blog-commits">Commits: <a href="https://github.com/nddipiazza/robos/commit/b0215d20">b0215d20</a> · <a href="https://github.com/nddipiazza/robos/commit/a0cc08a3">a0cc08a3</a></span>
    </div>
  </article>

</div>
<script type="module">
  import mermaid from 'https://cdn.jsdelivr.net/npm/mermaid@10.9.0/dist/mermaid.esm.min.mjs';
  mermaid.initialize({ startOnLoad: true, theme: 'dark' });
</script>
