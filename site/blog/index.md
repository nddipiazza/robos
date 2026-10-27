---
layout: default
title: Engineering Blog
description: "What changed in RobOS and why, newest first, with links to the docs and commits."
permalink: /blog/
extra_css: /assets/blog.css
og_image: /assets/hero/poster.jpg
og_image_alt: "RobOS Engineering Blog — What changed in RobOS and why"
schema_type: Blog
keywords: "RobOS engineering blog, release notes, RobOS Party Game, AI party game on Roku, OBD-II Auto Center, Audio Player Virtual DJ, Quest Warrior Dragon AI playthrough, KGraph updates"
---
<section class="blog-hero">
  <div class="wrap">
    <p class="eyebrow">RobOS</p>
    <h1>Engineering log</h1>
    <p class="lead">What changed in RobOS and why, newest first. Each post links to the docs and the commits behind it.</p>
  </div>
  <nav class="blog-jump" aria-label="Jump to blog post">
    <a href="#party-game">RobOS Party Game</a>
    <a href="#audio-player-ai-fix-metadata">Audio Player AI Fix Metadata</a>
    <a href="#vpn-sandbox-and-killswitch-proof">VPN Sandbox &amp; Kill-Switch Proof</a>
    <a href="#frontier-hunters-live-map-editor">RTS: Frontier Hunters &amp; Map Editor</a>
    <a href="#quest-warrior-dragon-ai-walkthrough">Quest: Warrior Dragon AI</a>
    <a href="#ai-playthrough-quest-warrior-dragon">AI Playthrough</a>
    <a href="#audio-player-virtual-dj">Audio Player Virtual DJ</a>
    <a href="#auto-center-obd">Auto Center OBD-II</a>
    <a href="#cli-agents-and-api-mode">CLI Agents &amp; API Mode</a>
    <a href="#cloud-storage-and-audio-suite">Cloud Storage &amp; Audio</a>
    <a href="#tabletop-rpg-and-election-2026">Tabletop RPG &amp; Election 2026</a>
    <a href="#robos-household-and-tax-prep">Household &amp; Tax Prep</a>
    <a href="#point-of-sale">Point of Sale</a>
    <a href="#auto-center">Auto Center</a>
    <a href="#starfall-command-rts">Starfall Command RTS</a>
    <a href="#skill-commons-and-site-v2">Skill Commons &amp; Site v2</a>
    <a href="#pr-review-theater-and-dev-central">PR Review Theater</a>
    <a href="#realm-of-heroes-crpg">Realm of Heroes cRPG</a>
    <a href="#robos-voice-and-parse-portal">RobOS Voice &amp; Luxir</a>
    <a href="#dual-state-kgraph-and-sdlc">Dual-State KGraph foundations</a>
  </nav>
</section>

<div class="blog-feed">

  <article class="blog-entry" id="party-game">
    <div class="blog-meta">
      <time class="blog-date" datetime="2026-10-27">Oct 27, 2026</time>
      <span class="blog-tag">RobOS Party Game</span>
      <span class="blog-tag">Party Games</span>
      <span class="blog-tag">Roku &amp; Smart TVs</span>
      <span class="blog-tag">AI Host</span>
    </div>
    <h2><a href="#party-game">RobOS Party Game: an AI Host That Writes the Party About Your Guests and Your House</a></h2>
    <p class="blog-summary"><strong>RobOS Party Game</strong> (<code>packages/party-game</code>) is the first game in the new <strong>Party Games</strong> category. An AI host in a hooded mask runs the show on one or more RobOS TVs while guests play on their phones. Before the first round, the AI reads every guest's survey and the party host's description of the house, then writes the night: each guest's role and why, superlatives about this group, trivia about their interests, bluffs, and real challenges that use the rooms and things in the house. The host speaks through the TV (Roku included) and any Google Cast speaker from the RobOS Audio Player.</p>
    <div class="blog-body">
      <figure class="blog-fig">
        <img src="{{ '/assets/blog/party-game/roku-living-room.jpg' | relative_url }}" alt="The Party Game lobby on a TCL Roku TV: the hooded masked AI host welcomes Quinn next to the join QR code" loading="lazy">
        <figcaption>A screenshot taken from the living-room <strong>TCL Roku TV</strong> through Roku's developer console: the lobby, with the host welcoming each guest by name as they scan the code.</figcaption>
      </figure>
      <p><strong>How a party runs.</strong> The host console needs at least one RobOS TV paired in Smart TV Studio and an AI agent picked with the shared <code>&lt;robos-agent-selector&gt;</code>. This is the one RobOS app where AI is required, because the AI host <em>is</em> the game. Guests scan the QR code on the TV and answer a survey: the basics, their interests, a few confessions and some wild cards. Until someone claims it, every phone shows <strong>I'm the party host</strong>. Whoever taps it describes the house: the usable spaces, what is special about them (guitar amps in the basement, a hot tub, a cat named Pancake), the games in the house, craft supplies, gear such as a printer, the vibe, and what is off-limits. The game cannot start until the required house answers are in. A meter on the phone encourages the party host to add more detail, because more detail makes better challenges.</p>
      <div class="blog-fig-grid">
        <figure class="blog-fig"><img src="{{ '/assets/games/party-game/lobby.jpg' | relative_url }}" alt="Lobby with the AI host giving a house tour" loading="lazy"><figcaption>The lobby once the house is described: the host's "house tour" name-drops the garage ping pong, the basement rock venue and Pancake.</figcaption></figure>
        <figure class="blog-fig"><img src="{{ '/assets/games/party-game/roles.jpg' | relative_url }}" alt="Role reveal: Jordan is The Detective" loading="lazy"><figcaption>Role reveal. The AI explains each role from the guest's own answers; the Mole is shown as "The Party Guest" until the finale.</figcaption></figure>
      </div>
      <p><strong>The writers' room never makes the room wait.</strong> Agent CLIs take seconds to answer, so every AI call runs in the background ahead of when it is needed (<a href="https://github.com/nddipiazza/robos/blob/main/packages/party-game/lib/ai-host.js"><code>lib/ai-host.js</code></a>). A guest finishes the survey and gets a personal welcome on the TV. The party host finishes the house and the host gives a house tour. Once everyone is ready, three calls run in parallel: the show script (title, opening, role reasons, game intros, Who Said That? teasers, superlatives and bluffs), trivia about each guest's interests, and House Quests built from the house survey. Standings recaps are written during the last reveal of each mini game, and the finale awards during the last mini game. In a real run with Antigravity, each call took 16 to 33 seconds and all of them were ready before the host pressed Start. If a call is slow or fails, the host uses stock material, so no click ever waits on an agent.</p>
      <div class="blog-fig-grid">
        <figure class="blog-fig"><img src="{{ '/assets/games/party-game/house-quest.jpg' | relative_url }}" alt="House Quest: The Sourdough Rock Opera in the basement" loading="lazy"><figcaption><strong>House Quest</strong>: the AI sent Maya to the basement drum kit and Priya to the karaoke mic for a sourdough rock anthem. Everyone else judges on their phones.</figcaption></figure>
        <figure class="blog-fig"><img src="{{ '/assets/games/party-game/trivia.jpg' | relative_url }}" alt="Nerd Alert Trivia question about Fleetwood Mac for Maya" loading="lazy"><figcaption><strong>Nerd Alert Trivia</strong>: Maya listed Fleetwood Mac, so she is the resident expert on this one. Beat the expert for a bonus.</figcaption></figure>
      </div>
      <p><strong>Five mini games on one template.</strong> <em>Who Said That?</em>, <em>Most Likely To</em>, <em>House Quest</em>, <em>Nerd Alert Trivia</em> and <em>Two Truths &amp; a Bot</em> are each a small file built on <a href="https://github.com/nddipiazza/robos/blob/main/packages/party-game/lib/minigames/template.js"><code>lib/minigames/template.js</code></a>. A mini game builds its rounds from the guests, the house and whatever the AI wrote, scores the answers, and supplies the host's lines. The engine (<a href="https://github.com/nddipiazza/robos/blob/main/packages/party-game/lib/game-engine.js"><code>lib/game-engine.js</code></a>) handles the TVs, phones, timers, scoreboard and role perks. The Detective sees one wrong answer crossed out, the Wildcard can double down, the Trickster earns a point for every guest they fool, and the Mole has a secret mission that is revealed at the finale.</p>
      <div class="blog-fig-grid">
        <figure class="blog-fig"><img src="{{ '/assets/games/party-game/finale.jpg' | relative_url }}" alt="Finale with the winner, the Mole unmasked and an AI award for every guest" loading="lazy"><figcaption>The finale: the winner, the Mole unmasked, and an AI-written award for every guest, including one thanking the party host for the house.</figcaption></figure>
        <figure class="blog-fig"><img src="{{ '/assets/games/party-game/phones.jpg' | relative_url }}" alt="Phones: the party host's house survey and the Detective's crossed-out answer" loading="lazy"><figcaption>On the phones: the party host's house survey, and the Detective's perk crossing out a wrong answer.</figcaption></figure>
      </div>
      <p><strong>Getting a Roku to show and speak the game.</strong> Browser TVs (LG webOS, Samsung Tizen, Android TV) simply load the game's TV page. A Roku has no browser, so the shared TV engine gained <em>app casts</em> (<a href="https://github.com/nddipiazza/robos/blob/main/packages/robos-lib/tv-engine.js"><code>robos-lib/tv-engine.js</code></a>). The party game renders each Roku's screen in an offscreen window and pushes JPEG frames to the TV portal. The RobOS TV channel, rebuilt and sideloaded on cast just as a Dashboards cast does, shows those frames on its poster layer. Sound took two fixes, both confirmed on the TV through Roku's media-player query and debug console. A Roku has a single media pipeline, so the host's lines now play through the channel's keep-alive video player as small MP4 clips. That keep-alive stops the TV from going to standby, and its once-a-second check was restarting it over every line, so the check now steps aside while the host is talking: stop the keep-alive, play the line, start the keep-alive again. The same lines can also go to a <strong>RobOS Audio Player</strong> speaker. If music is playing on that speaker, the Audio Player's new control API plays the line on it and resumes the song where it left off.</p>
      <div class="blog-log"># Run the Party Game tests (engine, AI writers' room with a stub agent, mini games, LAN server, narration routing)
cd packages/robos-test && node --test tests/party-game/unit.test.js

# Start the game from source (pair a TV in Smart TV Studio and sign in to an agent first)
cd packages/party-game && npm install && npx electron . --no-sandbox

# Check what a Roku is playing: the 60000 ms clip is the keep-alive; anything else is the host speaking
curl http://&lt;roku-ip&gt;:8060/query/media-player</div>
    </div>
    <div class="blog-links">
      <a href="{{ '/games/party-game/' | relative_url }}">RobOS Party Game →</a>
      <a href="{{ '/games/party-game/docs/' | relative_url }}">Party Game docs →</a>
      <a href="https://github.com/nddipiazza/robos/tree/main/packages/party-game/lib/minigames">Mini game template &amp; examples →</a>
      <span class="blog-commits">Commits: <a href="https://github.com/nddipiazza/robos/commit/6e4f4314">6e4f4314</a> · <a href="https://github.com/nddipiazza/robos/commit/7c48575b">7c48575b</a> · <a href="https://github.com/nddipiazza/robos/commit/763b802e">763b802e</a> · <a href="https://github.com/nddipiazza/robos/commit/6a1cafbe">6a1cafbe</a> · <a href="https://github.com/nddipiazza/robos/commit/3f2de2b2">3f2de2b2</a> · <a href="https://github.com/nddipiazza/robos/commit/0738f77c">0738f77c</a> · <a href="https://github.com/nddipiazza/robos/commit/20cfe81a">20cfe81a</a> · <a href="https://github.com/nddipiazza/robos/commit/a58803ae">a58803ae</a> · <a href="https://github.com/nddipiazza/robos/commit/12c28cdc">12c28cdc</a></span>
    </div>
  </article>

  <article class="blog-entry" id="audio-player-ai-fix-metadata">
    <div class="blog-meta">
      <time class="blog-date" datetime="2026-10-26">Oct 26, 2026</time>
      <span class="blog-tag">RobOS Audio Player</span>
      <span class="blog-tag">AI Fix Metadata &amp; Artwork</span>
      <span class="blog-tag">Open-Source Media Skill</span>
      <span class="blog-tag">MusicBrainz &amp; FFmpeg</span>
    </div>
    <h2><a href="#audio-player-ai-fix-metadata">RobOS Audio Player: AI Fix Metadata &amp; Artwork with Open-Source Media Probing, MusicBrainz CC0, and FFmpeg</a></h2>
    <p class="blog-summary"><strong>RobOS Audio Player</strong> (<code>packages/audio-player</code>) now includes <strong>✦ AI Fix Metadata &amp; Artwork</strong>, built on the shared <code>&lt;robos-agent-selector&gt;</code> and <code>&lt;robos-ai-textarea&gt;</code> components and backed by the new <code>fix-media-metadata</code> agent skill. It inspects local and cloud audio/video containers (<code>.mp3</code>, <code>.flac</code>, <code>.m4a</code>, <code>.ogg</code>, <code>.opus</code>, <code>.wav</code>, <code>.mkv</code>, <code>.webm</code>), sidecar files (<code>.cue</code>, <code>.lrc</code>, <code>.nfo</code>), and strictly legal open-data APIs (<strong>MusicBrainz WS/2 CC0</strong>, <strong>Cover Art Archive</strong>, and <strong>LRCLIB</strong>) to repair messy titles, resolve canonical artists/albums/composers/years, extract or synthesize cover art, and optionally write lossless tags back to disk via <code>ffmpeg</code>.</p>
    <div class="blog-body">
      <figure class="blog-fig">
        <img src="{{ '/assets/blog/audio-player-ai-fix-metadata/library-albums-enriched.png' | relative_url }}" alt="RobOS Audio Player showing the enriched Video Game Music album grid with extracted and open-source generated cover art" loading="lazy">
        <figcaption><strong>RobOS Audio Player</strong> after running <strong>✦ AI Fix Metadata</strong> on a 12-track Google Drive <code>video game music</code> folder: what started as 1 generic folder album and 6 unknown/uploader artists was automatically organized into 11 canonical game soundtrack albums, 12 artists, 9 composers, 4 decades, and 100% cover art.</figcaption>
      </figure>
      <p><strong>Reusable RobOS UI components and the <code>fix-media-metadata</code> skill.</strong> Rather than inventing custom prompt controls, <strong>AI Fix Metadata</strong> embeds the standard <code>&lt;robos-agent-selector&gt;</code> and <code>&lt;robos-ai-textarea&gt;</code> (<a href="https://github.com/nddipiazza/robos/blob/main/packages/audio-player/src/AiFixMetadata.jsx"><code>packages/audio-player/src/AiFixMetadata.jsx</code></a>) with <code>/skills</code> command browsing and <code>@mention</code> file typeahead wired to <code>packages/robos-lib/skill-catalog.js</code>. The textarea opens pre-populated with <code>@skill(robos:fix-media-metadata)</code> (<a href="https://github.com/nddipiazza/robos/blob/main/plugins/robos/skills/fix-media-metadata/SKILL.md"><code>plugins/robos/skills/fix-media-metadata/SKILL.md</code></a>), giving your chosen coding agent (AGY, Claude Code, Codex, Gemini CLI, or GitHub Copilot) full domain instructions on container tag layouts, scene/ripper filename noise removal, open-data cross-referencing, and cover art selection.</p>
      <div class="blog-fig-grid">
        <figure class="blog-fig"><img src="{{ '/assets/blog/audio-player-ai-fix-metadata/ai-fix-metadata-modal.png' | relative_url }}" alt="AI Fix Metadata modal in RobOS Audio Player with robos-agent-selector and robos-ai-textarea pre-populated with @skill(robos:fix-media-metadata)" loading="lazy"><figcaption>The <strong>✦ AI Fix Metadata &amp; Artwork</strong> modal reusing <code>&lt;robos-agent-selector&gt;</code> and <code>&lt;robos-ai-textarea&gt;</code> with <code>@skill(robos:fix-media-metadata)</code>.</figcaption></figure>
        <figure class="blog-fig"><img src="{{ '/assets/blog/audio-player-ai-fix-metadata/library-songs-enriched.png' | relative_url }}" alt="Enriched Songs table in RobOS Audio Player showing canonical titles, composers, albums, years, and Video Game Music genres" loading="lazy"><figcaption>The enriched <strong>Songs</strong> view with cleaned titles, canonical soundtrack albums, release years, and genres.</figcaption></figure>
      </div>
      <p><strong>100% open-source, legal media probing and artwork pipeline.</strong> For every track in the selected scope (selected rows, active folder, tracks missing metadata/art, or a library batch), <a href="https://github.com/nddipiazza/robos/blob/main/packages/audio-player/lib/ai-metadata.js"><code>packages/audio-player/lib/ai-metadata.js</code></a> runs a multi-stage open-source pipeline: it parses container tags with MIT-licensed <code>music-metadata</code>, probes stream/container headers and attached pictures with <code>ffprobe</code>, inspects sibling <code>.cue</code>, <code>.lrc</code>, and <code>.nfo</code> sidecars, and queries the CC0 <strong>MusicBrainz WS/2 API</strong> and <strong>LRCLIB</strong>. For tracks missing cover art, it extracts embedded <code>APIC</code> / <code>METADATA_BLOCK_PICTURE</code> / <code>covr</code> streams or representative video frames via <code>ffmpeg</code>, checks folder images (<code>cover.jpg</code>, <code>folder.png</code>), downloads official sleeves from the <strong>Cover Art Archive</strong>, or synthesizes an open-source FFmpeg waveform / SVG album sleeve. Every proposed change is presented as an interactive before→after diff card so you can review and selectively apply updates to the library index, playlists, and (optionally) directly into local media files via lossless <code>ffmpeg -c copy</code> stream muxing.</p>
      <div class="blog-log"># Run the open-source media metadata &amp; FFmpeg tag-writing unit tests
node --test packages/audio-player/lib/*.test.js

# Trigger AI Fix Metadata on the running Audio Player via DOM Snapshot IPC (port 19196)
node packages/robos-lib/snapshot-cli.js audio-player --click 'button#btn-library-ai-fix-metadata'
node packages/robos-lib/snapshot-cli.js audio-player --click 'button#btn-ai-fix-metadata-run'
node packages/robos-lib/snapshot-cli.js audio-player --click 'button#btn-ai-fix-metadata-apply'</div>
    </div>
    <div class="blog-links">
      <a href="{{ '/v1/apps/audio-player/' | relative_url }}">RobOS Audio Player docs →</a>
      <a href="https://github.com/nddipiazza/robos/blob/main/plugins/robos/skills/fix-media-metadata/SKILL.md">fix-media-metadata skill →</a>
      <a href="https://github.com/nddipiazza/robos/blob/main/packages/audio-player/lib/ai-metadata.js">ai-metadata.js engine →</a>
      <a href="https://github.com/nddipiazza/robos/blob/main/packages/audio-player/lib/ai-metadata.test.js">Unit &amp; FFmpeg E2E tests →</a>
      <span class="blog-commits">Commits: <a href="https://github.com/nddipiazza/robos/commit/164e8713">164e8713</a> · <a href="https://github.com/nddipiazza/robos/commit/d4c0f112">d4c0f112</a></span>
    </div>
  </article>

  <article class="blog-entry" id="vpn-sandbox-and-killswitch-proof">
    <div class="blog-meta">
      <time class="blog-date" datetime="2026-10-24">Oct 24, 2026</time>
      <span class="blog-tag">RobOS VPN Sandbox</span>
      <span class="blog-tag">RobOS VPN Servers</span>
      <span class="blog-tag">Linux ip-netns &amp; iptables</span>
      <span class="blog-tag">Security Proof</span>
    </div>
    <h2><a href="#vpn-sandbox-and-killswitch-proof">RobOS VPN Sandbox &amp; VPN Servers: Per-App Linux Network Namespaces and a Live Kernel Kill-Switch Proof</a></h2>
    <p class="blog-summary">Two new desktop apps—<strong>RobOS VPN Servers</strong> (<code>packages/vpn-servers</code>) and <strong>RobOS VPN Sandbox</strong> (<code>packages/vpn-sandbox</code>)—let you launch individual desktop or CLI applications (such as Firefox, Transmission, or <code>curl</code>) inside an isolated Linux network namespace (<code>ip netns</code>) routed exclusively through OpenVPN (with all 3,598 official IPVanish server profiles bundled out of the box). An automated 5-step fault-injection proof kills the OpenVPN daemon mid-flight and verifies at the kernel packet counter level that zero bytes ever fall back to your normal public IP.</p>
    <div class="blog-body">
      <figure class="blog-fig">
        <img src="{{ '/assets/security/vpn-sandbox-killswitch-proven.png' | relative_url }}" alt="RobOS VPN Sandbox showing Firefox running inside an isolated VPN namespace and the live 5-step Kill-Switch Proof banner" loading="lazy">
        <figcaption><strong>RobOS VPN Sandbox</strong> running on Ubuntu 26.04 LTS: Firefox is confined to an isolated namespace exiting through IPVanish Atlanta (<code>216.131.74.203</code>) while the host's normal public IP (<code>105.42.88.19</code>) is blocked, and the top banner reports the live 5-step mid-session OpenVPN drop proof.</figcaption>
      </figure>
      <p><strong>3,598 IPVanish profiles and GPG-encrypted credentials.</strong> <strong>RobOS VPN Servers</strong> bundles the complete IPVanish `.ovpn` server catalog (<a href="https://github.com/nddipiazza/robos/blob/main/packages/robos-lib/assets/ipvanish-configs.tar.xz"><code>packages/robos-lib/assets/ipvanish-configs.tar.xz</code></a>), pre-sanitized for OpenVPN 2.6/2.7 compatibility by stripping deprecated <code>keysize</code> directives and negotiating <code>AES-256-GCM:AES-128-GCM:CHACHA20-POLY1305:AES-256-CBC</code>. Account passwords are encrypted in <code>pass</code> (<code>robos/ovpn/&lt;provider&gt;/&lt;account&gt;</code>) with an automatic AES-256-GCM local vault fallback, and a one-click <strong>Test</strong> button performs a live TLS 1.3 handshake to verify <code>PUSH_REPLY</code> and the assigned tunnel IP before launching any app.</p>
      <div class="blog-fig-grid">
        <figure class="blog-fig"><img src="{{ '/assets/security/vpn-servers-verified.png' | relative_url }}" alt="RobOS VPN Servers managing an IPVanish account and 3,605 server locations" loading="lazy"><figcaption><strong>RobOS VPN Servers</strong>: account management, live credential testing, and country/city filtering across 3,600+ locations.</figcaption></figure>
        <figure class="blog-fig"><img src="{{ '/assets/security/vpn-killswitch-architecture.png' | relative_url }}" alt="3-Barrier Kernel Kill-Switch Architecture diagram for RobOS VPN Sandbox" loading="lazy"><figcaption>The 3-Barrier Linux Kernel Kill-Switch inside <code>robos_vpn_&lt;id&gt;</code>.</figcaption></figure>
      </div>
      <p><strong>Three kernel barriers when OpenVPN stops.</strong> Unlike OS-wide VPN clients that share the host routing table and fall back to the default gateway when <code>tun0</code> drops, <strong>RobOS VPN Sandbox</strong> places each launched app inside its own network namespace (<code>robos_vpn_&lt;id&gt;</code>) as an unprivileged user (<code>uid 1000</code>, <code>setpriv --inh-caps=-net_admin,-net_raw</code>). Inside the namespace, <code>iptables -P OUTPUT DROP</code> and <code>ip6tables -P OUTPUT DROP</code> block all egress except <code>-o tun+</code>; on the virtual Ethernet link (<code>veth_n_&lt;id&gt;</code>), only <code>-m owner --uid-owner 0</code> (the root OpenVPN daemon) to the exact VPN server IP and port is permitted, followed by <code>-A OUTPUT -o veth_n_&lt;id&gt; -j DROP</code>. On the host side, both the <code>FORWARD</code> chain (<code>ROBOS_VPN_FWD_&lt;id&gt;</code>) and the <code>POSTROUTING</code> <code>MASQUERADE</code> rule are locked strictly to the VPN server IP and port. Namespace-specific <code>/etc/netns/robos_vpn_&lt;id&gt;/resolv.conf</code> and <code>nsswitch.conf</code> (<code>hosts: files dns</code>) paired with <code>openvpn --dns-updown disable</code> ensure DNS queries travel exclusively through <code>tun0</code> without touching host <code>systemd-resolved</code>.</p>
      <p><strong>Proving zero leak on mid-session VPN crash.</strong> The new <strong>/security/</strong> section debuts with our live 5-phase E2E fault-injection test (<a href="https://github.com/nddipiazza/robos/blob/main/tests/e2e/vpn-sandbox-killswitch-proof.test.cjs"><code>tests/e2e/vpn-sandbox-killswitch-proof.test.cjs</code></a>, also runnable via the <strong>Prove Kill-Switch</strong> button in the app). It records the host's real public IP (<code>105.42.88.19</code>), verifies the sandboxed app reaches <code>https://api.ipify.org</code> via the IPVanish tunnel IP (<code>216.131.74.203</code>), sends <code>kill -9</code> to the OpenVPN daemon while leaving <code>robos_vpn_&lt;id&gt;</code> and its <code>veth</code> default route up, fires four egress probes from the unprivileged app (HTTPS, direct TCP to <code>1.1.1.1:80</code>, direct UDP to <code>8.8.8.8:53</code>, and direct UDP to the VPN server IP as <code>uid 1000</code>), and verifies via kernel <code>iptables -L OUTPUT -v -n -x</code> counters that 100% of post-drop packets are dropped in the kernel with zero bytes leaked.</p>
      <div class="blog-log"># Launch the apps
scripts/dev-launch.sh vpn-servers
scripts/dev-launch.sh vpn-sandbox

# Run unit tests and live kernel E2E kill-switch proof
node --test packages/robos-lib/ovpn-providers.test.cjs
ROBOS_VPN_LIVE_E2E=1 node --test tests/e2e/vpn-sandbox-killswitch-proof.test.cjs</div>
    </div>
    <div class="blog-links">
      <a href="{{ '/security/#zero-leak-vpn-app-sandbox' | relative_url }}">Full security proof &amp; architecture →</a>
      <a href="{{ '/v1/apps/vpn-sandbox/' | relative_url }}">RobOS VPN Sandbox docs →</a>
      <a href="{{ '/v1/apps/vpn-servers/' | relative_url }}">RobOS VPN Servers docs →</a>
      <a href="https://github.com/nddipiazza/robos/blob/main/tests/e2e/vpn-sandbox-killswitch-proof.test.cjs">E2E Kill-Switch test →</a>
      <span class="blog-commits">Commits: <a href="https://github.com/nddipiazza/robos/commit/b0215d20">b0215d20</a> · <a href="https://github.com/nddipiazza/robos/commit/a0cc08a3">a0cc08a3</a> · <a href="https://github.com/nddipiazza/robos/commit/45e1f139">45e1f139</a> · <a href="https://github.com/nddipiazza/robos/commit/3e7aec51">3e7aec51</a></span>
    </div>
  </article>

  <article class="blog-entry" id="frontier-hunters-live-map-editor">
    <div class="blog-meta">
      <time class="blog-date" datetime="2026-10-23">Oct 23, 2026</time>
      <span class="blog-tag">Starfall Command RTS</span>
      <span class="blog-tag">Map Editor</span>
      <span class="blog-tag">Live Gameplay Tests</span>
    </div>
    <h2><a href="#frontier-hunters-live-map-editor">Frontier Hunters: a bigger battlefield, a reusable editor, and tests that play to victory</a></h2>
    <p class="blog-summary">Starfall Command now opens with one player against one AI on a 256×256 battlefield inspired by Big Game Hunters. Two commanders draw distinct starting sites from eight perimeter bases, each with a Colony Hub and 12 workers. Deposits never run out. Everything you build still costs resources, takes time and uses supply. The match ends when one side has no structures left.</p>
    <div class="blog-body">
      <figure class="blog-fig">
        <video poster="{{ '/assets/games/rts/frontier-hunters-live.jpg' | relative_url }}" controls playsinline preload="metadata" width="1920" height="1080">
          <source src="{{ '/assets/games/rts/frontier-hunters-live.mp4' | relative_url }}" type="video/mp4">
          <track kind="captions" src="{{ '/assets/games/rts/frontier-hunters-live.vtt' | relative_url }}" srclang="en" label="English walkthrough" default>
        </video>
        <figcaption>A complete recorded Rush build against Hard Siege AI, seed 29: gathering, construction, army production, combat and structure-elimination victory. The engine advances on its live frame clock; the controller made zero manual step requests. Capture is 1080p at 10 frames per second.</figcaption>
      </figure>
      <p><strong>The map is something you can edit and play.</strong> Waterways divide the outer bases and interior expansions, with land crossings connecting them. The Godot 4 editor paints terrain, fills regions, places starts and expansions, authors resources and units, and supports undo, validation and atomic saves. F5 plays the current document; F10 returns to it with undo history intact. The bounded fill and brush cores reuse MIT-licensed code from <a href="https://github.com/saman-mb/crusade-rts">Crusade RTS</a>, credited at a pinned revision in the repository.</p>
      <div class="blog-fig-grid">
        <figure class="blog-fig"><img src="{{ '/assets/games/rts/frontier-hunters-map.png' | relative_url }}" alt="The complete Frontier Hunters battlefield, with waterways, crossings and eight perimeter starting bases" loading="lazy"><figcaption>The full 256×256 battlefield.</figcaption></figure>
        <figure class="blog-fig"><img src="{{ '/assets/games/rts/frontier-map-editor.png' | relative_url }}" alt="Frontier Hunters in the Godot map editor with terrain tools and numbered starting sites" loading="lazy"><figcaption>The same map in the reusable editor.</figcaption></figure>
      </div>
      <p><strong>The tests build an economy before they fight.</strong> Each live case edits, saves and reloads its map, checks the standard opening, then runs a paid Rush, Siege or Economy build against the independent opponent. Easy, Normal and Hard change the AI's decisions and production targets; they use the same starting resources, prices and combat statistics. Tests must reach an actual win condition. An unattended player must also lose. Unfinished expansions keep their owner alive after the main base falls.</p>
      <p><strong>The hiccups had measurable causes.</strong> Synchronous PNG encoding could stall the frame thread for roughly 800 ms, and incomplete HTTP requests could make it wait another 50–100 ms. Capture encoding now runs on a worker, socket handling buffers partial messages without waiting, and accelerated simulation yields between ticks. Static geometry is batched, human unit bodies share MultiMesh instances, the minimap caches its terrain, and harvesting and targeting reuse spatial data.</p>
      <p>On a local GTX 1050 Ti with Godot 4.7.2's compatibility renderer at 1920×1080, a paid army of roughly 80 units ran at an observed 49–60 FPS at normal speed after a 180-game-second warm-up. The final rolling frame sample measured 26.952 ms at the 95th percentile and a 72.047 ms maximum, passing the probe's 33.34 ms and 100 ms budgets. These are measurements on this machine. In the recorded match, requested 8× playback achieved 2.58 game seconds per wall second under rendering and recording load; fast-forward adapts to available CPU time.</p>
      <p>Verification on October 23: the complete backend suite passed <strong>20 scenarios and 128 steps</strong>; the live frame-clock suite passed <strong>6 scenarios and 40 steps</strong>; the rendered match and responsiveness checks passed <strong>2 scenarios and 13 steps</strong>. Navigation, spatial-query, editor-document and render-batching regressions also passed. Each live run retains its authored map, paid action log, observations, frame timings and result; recorded runs add video and WebVTT captions.</p>
      <div class="blog-log"># From games/robos-rts; set GODOT_BIN to your Godot executable
python run_cucumber_tests.py --backend
python run_cucumber_tests.py --realtime-headless --speed=8
python run_cucumber_tests.py --realtime --speed=8 --record
python run_cucumber_tests.py --realtime --show-window --keep-open --speed=4 --name="@1.4"
python tests/e2e/performance_probe.py --warmup=180 --duration=20 --speed=1 --p95-ms=33.34 --max-frame-ms=100</div>
      <p>The current playable focus is one human versus one AI, using the Meridian Guard roster for both sides. The editor preserves campaign and future multiplayer metadata through save and reload; campaign scripting and network multiplayer still need engine work. The older three-faction canyon remains a mechanics showcase.</p>
    </div>
    <div class="blog-links">
      <a href="{{ '/games/robos-rts/' | relative_url }}">Game &amp; walkthrough →</a>
      <a href="{{ '/v1/projects/robos-rts/#map-editor' | relative_url }}">Map editor guide →</a>
      <a href="{{ '/v1/projects/robos-rts/#live-gameplay-and-frame-performance-tests' | relative_url }}">Reproduce the tests →</a>
      <a href="{{ '/assets/games/rts/frontier-hunters-live-proof.json' | relative_url }}">Recorded match proof →</a>
      <a href="{{ '/assets/games/rts/frontier-hunters-performance.json' | relative_url }}">Normal-speed frame samples →</a>
      <span class="blog-commits">Commits: <a href="https://github.com/nddipiazza/robos/commit/4725429d">4725429d</a> · <a href="https://github.com/nddipiazza/robos/commit/94ef6410">94ef6410</a></span>
    </div>
  </article>

  <article class="blog-entry" id="quest-warrior-dragon-ai-walkthrough">
    <div class="blog-meta">
      <time class="blog-date" datetime="2026-10-23">Oct 23, 2026</time>
      <span class="blog-tag">Quest: Warrior Dragon</span>
      <span class="blog-tag">Game AI</span>
      <span class="blog-tag">Godot 4</span>
    </div>
    <h2><a href="#quest-warrior-dragon-ai-walkthrough">Quest: Warrior Dragon Plays Itself: From the King's Throne Room to the Dragonlord's True Form</a></h2>
    <p class="blog-summary">Start Quest: Warrior Dragon with <code>--demo</code> and nobody touches the controller. The in-engine AI picks New Quest, listens to King Lorik, opens the treasure chest, takes the Magic Key to the locked door, walks down through Tantegel Castle and out into Alefgard, then fights whatever jumps out of the grass. Point it at the Dragonlord and it wins that fight too. Everything below was recorded from the game running headless on a virtual display, with no human input.</p>
    <div class="blog-body">
      <figure class="blog-fig video-embed">
        <iframe src="https://www.youtube-nocookie.com/embed/o6RHKMKD2AU" title="Quest: Warrior Dragon: the RobOS AI plays the whole game, throne room to Dragonlord" loading="lazy" referrerpolicy="strict-origin-when-cross-origin" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen></iframe>
        <figcaption>The whole game in one uninterrupted run: all 74 milestones from King Lorik's throne room to the Dragonlord, hero level 21, 2,621 battles, 6 deaths. Chapters in the description jump to each milestone. Recorded with the full-game play mode, which goes further than the <code>--demo</code> run below. <a href="https://www.youtube.com/watch?v=o6RHKMKD2AU">Watch on YouTube</a></figcaption>
      </figure>
      <figure class="blog-fig pixel">
        <video poster="{{ '/assets/blog/quest-warrior-dragon-ai/king-lorik.png' | relative_url }}" autoplay muted loop playsinline controls preload="metadata" width="512" height="480">
          <source src="{{ '/assets/blog/quest-warrior-dragon-ai/ai-walkthrough.webm' | relative_url }}" type="video/webm">
          <source src="{{ '/assets/blog/quest-warrior-dragon-ai/ai-walkthrough.mp4' | relative_url }}" type="video/mp4">
        </video>
        <figcaption>42 seconds, real time, no human input: King Lorik, the Magic Key, the throne-room door, Tantegel Castle, the overworld and the first Slime and Drakee fights.</figcaption>
      </figure>
      <div class="blog-stats">
        <div><b>~12 s</b><span>New Quest to the overworld</span></div>
        <div><b>0</b><span>human button presses</span></div>
        <div><b>5 / 6</b><span>boss-tier battle tests won</span></div>
        <div><b>36 / 220</b><span>HP left after the Dragonlord</span></div>
      </div>
      <p><strong>It plays with the same buttons you do.</strong> <code>AIEngine.gd</code> is an autoload inside the Godot game. It can only send the input actions a player can (<code>move_up</code>, <code>move_down</code>, <code>move_left</code>, <code>move_right</code>, <code>ui_accept</code>, <code>ui_cancel</code>, <code>cmd_menu</code>), so it opens the command window and moves the cursor to <em>TAKE</em> or <em>DOOR</em> like a person would. It never teleports and never sets the game state directly. Each tick it reads the same JSON the game's HTTP control server publishes (<code>/state</code> for the hero, dialog, menus and battle, <code>/screen</code> for a walkable map of the visible tiles with every chest, door and staircase marked). It runs a breadth-first search to its next goal and walks there in <strong>strides</strong>: on a straight run it holds the direction down across several tiles and lets go as the hero steps onto the last one, instead of tapping once per tile.</p>
      <p>A run from New Quest reads like this (taken from the state log the capture script recorded):</p>
      <div class="blog-log">SaveSelect   ▶ BEGIN A NEW QUEST
ThroneRoom   King Lorik: "Then speak with the guards, for they have much knowledge…"
ThroneRoom   cmd_menu → TAKE         "Thou dost find Magic Key!"
ThroneRoom   cmd_menu → DOOR         "The door clicks open."
ThroneRoom   stride → stairs (9,9)  cmd_menu → STAIRS
Castle1F     stride → south gate (11,30)
WorldMap     (44,45)  ⚔ Slime        HP 15 → 12
WorldMap     (44,45)  ⚔ Red Slime
WorldMap     (44,46)  ⚔ Red Slime    HP 9 → 6</div>
      <div class="blog-fig-grid three">
        <figure class="blog-fig pixel">
          <img src="{{ '/assets/blog/quest-warrior-dragon-ai/save-select.png' | relative_url }}" alt="Save select screen with BEGIN A NEW QUEST highlighted above seven checkpoint saves" loading="lazy" width="512" height="480">
          <figcaption>The AI picks <em>Begin a New Quest</em>.</figcaption>
        </figure>
        <figure class="blog-fig pixel">
          <img src="{{ '/assets/blog/quest-warrior-dragon-ai/king-lorik.png' | relative_url }}" alt="Throne room with King Lorik speaking: Then speak with the guards, for they have much knowledge that may aid thee." loading="lazy" width="512" height="480">
          <figcaption>King Lorik gives his speech; the AI reads every page.</figcaption>
        </figure>
        <figure class="blog-fig pixel">
          <img src="{{ '/assets/blog/quest-warrior-dragon-ai/magic-key.png' | relative_url }}" alt="Throne room with the dialog: Thou dost find Magic Key!" loading="lazy" width="512" height="480">
          <figcaption>TAKE on the chest: <em>Thou dost find Magic Key!</em></figcaption>
        </figure>
        <figure class="blog-fig pixel">
          <img src="{{ '/assets/blog/quest-warrior-dragon-ai/castle-1f.png' | relative_url }}" alt="Tantegel Castle first floor with the hero walking toward the south gate" loading="lazy" width="512" height="480">
          <figcaption>Down the stairs and through Tantegel Castle.</figcaption>
        </figure>
        <figure class="blog-fig pixel">
          <img src="{{ '/assets/blog/quest-warrior-dragon-ai/overworld.png' | relative_url }}" alt="Alefgard overworld with the hero just outside Tantegel Castle by the river" loading="lazy" width="512" height="480">
          <figcaption>Out into Alefgard.</figcaption>
        </figure>
        <figure class="blog-fig pixel">
          <img src="{{ '/assets/blog/quest-warrior-dragon-ai/slime-battle.png' | relative_url }}" alt="Battle screen: a Slime, with the message The Slime takes 3 damage!" loading="lazy" width="512" height="480">
          <figcaption>First blood: <em>The Slime takes 3 damage!</em></figcaption>
        </figure>
      </div>
      <p><strong>The bug it found for us.</strong> The first time we ran it this week, the hero opened the chest, unlocked the door and then walked into the throne-room counter forever. Yesterday's tile audit (85c4559f) made tile 8 the counter around King Lorik, and a floor tile in every town, but the control server still listed tiles 8 and 21 as staircases in <code>/screen</code>. The AI treated the counter at (5,3) as the nearest staircase. Only tiles 33 and 34 are staircases; mapped stairs come from <code>stair_registry.json</code>. With that fixed in 4f6bbe3d, the same run gets from New Quest to the overworld in about twelve seconds. No test caught this; an AI player did, just by trying to play.</p>
      <p><strong>Boss fights.</strong> The <em>Enemy AI</em> side of demo mode is the game's normal monster logic: attack patterns, spells and fire breath from <code>monsters.json</code>. To show the <em>Player AI</em> against the strongest monsters we used the debug launcher's battle test, which starts a fight against any of the 40 monsters with whatever hero stats you give it:</p>
      <div class="blog-log">./launch.sh --demo --scene BattleTest --monster dragonlord_form1 \
  --hero-level 30 --hero-hp 220 --hero-hp-max 220 --hero-atk 150 --hero-def 170</div>
      <p>A level-15 hero with 90 HP lost to the <strong>Golem</strong>. At level 20 the AI beat it twice, and at level 30 it beat the <strong>Green Dragon</strong>, the Dragonlord's final form on its own (<code>dragonlord_form2</code>) and the full two-stage <strong>Dragonlord</strong> fight. That last fight is below, about seven seconds from <em>A Dragonlord draws near!</em> to the final blow:</p>
      <figure class="blog-fig pixel">
        <video poster="{{ '/assets/blog/quest-warrior-dragon-ai/dragonlord-true-form.png' | relative_url }}" autoplay muted loop playsinline controls preload="metadata" width="512" height="480">
          <source src="{{ '/assets/blog/quest-warrior-dragon-ai/dragonlord-fight.webm' | relative_url }}" type="video/webm">
          <source src="{{ '/assets/blog/quest-warrior-dragon-ai/dragonlord-fight.mp4' | relative_url }}" type="video/mp4">
        </video>
        <figcaption>The AI against both stages of the Dragonlord: HURTMORE, “Foolish hero…”, the transformation, fire breath, and a win with 36 of 220 HP left.</figcaption>
      </figure>
      <div class="blog-fig-grid three">
        <figure class="blog-fig pixel">
          <img src="{{ '/assets/blog/quest-warrior-dragon-ai/dragonlord-hurtmore.png' | relative_url }}" alt="Battle screen: The Dragonlord casts HURTMORE!" loading="lazy" width="512" height="480">
          <figcaption>The wizard opens with HURTMORE: 34 damage.</figcaption>
        </figure>
        <figure class="blog-fig pixel">
          <img src="{{ '/assets/blog/quest-warrior-dragon-ai/dragonlord-foolish-hero.png' | relative_url }}" alt="Battle screen with the Dragonlord fading: Foolish hero... You cannot defeat me that easily!" loading="lazy" width="512" height="480">
          <figcaption>“Foolish hero… You cannot defeat me that easily!”</figcaption>
        </figure>
        <figure class="blog-fig pixel">
          <img src="{{ '/assets/blog/quest-warrior-dragon-ai/dragonlord-true-form.png' | relative_url }}" alt="Battle screen with the winged dragon form: BEHOLD MY TRUE FORM!" loading="lazy" width="512" height="480">
          <figcaption><em>BEHOLD MY TRUE FORM!</em></figcaption>
        </figure>
        <figure class="blog-fig pixel">
          <img src="{{ '/assets/blog/quest-warrior-dragon-ai/dragonlord-breathes-fire.png' | relative_url }}" alt="Battle screen: The Dragonlord breathes fire! with hero HP 149 of 220" loading="lazy" width="512" height="480">
          <figcaption>Fire breath: 66 damage a time.</figcaption>
        </figure>
        <figure class="blog-fig pixel">
          <img src="{{ '/assets/blog/quest-warrior-dragon-ai/hero-at-36-hp.png' | relative_url }}" alt="Battle screen with hero HP at 36 of 220 in red: ERDRICK takes 47 damage!" loading="lazy" width="512" height="480">
          <figcaption>Down to 36 HP. The AI keeps swinging.</figcaption>
        </figure>
        <figure class="blog-fig pixel">
          <img src="{{ '/assets/blog/quest-warrior-dragon-ai/dragonlord-final-blow.png' | relative_url }}" alt="Battle screen: The Dragonlord takes 41 damage!" loading="lazy" width="512" height="480">
          <figcaption>The final blow: 41 damage, and Alefgard is safe.</figcaption>
        </figure>
      </div>
      <p><strong>What the <code>--demo</code> mode can't do yet</strong>, which is the to-do list. The full-game play mode in the video above does all of it: it routes across Alefgard, casts spells and earns its level before Charlock (<a href="{{ '/games/quest-warrior-dragon/ai-playthrough/' | relative_url }}">how that mode works</a>).</p>
      <ul>
        <li><strong>The overworld has no goal.</strong> The AI has routes for the throne room and the castle's first floor. Outside, it walks a right, down, left, up loop next to the castle, which is enough to trigger random encounters but not to reach Brecconary. It wanders back through the castle gate now and then, and the castle logic walks it straight back out.</li>
      <li><strong>It never casts spells.</strong> In battle it chooses FIGHT, or ITEM to use a Herb when HP falls under 35%. The hero in the Dragonlord fight had 190 MP and HEALMORE but no Herb, so at 36 HP it attacked again. It got lucky.</li>
        <li><strong>Boss fights start from the debug launcher.</strong> The new-game run can't reach Charlock yet, so the boss footage uses a hand-picked hero level, not one the AI earned.</li>
      </ul>
      <p><strong>Watch it yourself.</strong> From <code>games/quest-warrior-dragon</code>, run <code>./launch.sh --demo</code>, or set <code>DW_DEMO=1</code>. In a running game, <code>POST /command</code> with <code>start_demo</code> or <code>stop_demo</code> switches the AI on or off, and <code>capture_screenshot</code> saves the frame exactly as the game draws it, which is how the stills above were taken. The videos are an <code>ffmpeg</code> recording of the Xvfb display the game ran on.</p>
    </div>
    <div class="blog-links">
      <a href="{{ '/games/quest-warrior-dragon/' | relative_url }}">Play Quest: Warrior Dragon →</a>
      <a href="{{ '/games/quest-warrior-dragon/docs/' | relative_url }}">Read the game docs →</a>
      <span class="blog-commits">Commits: 4f6bbe3d · 5591ffe1 · 85c4559f</span>
    </div>
  </article>

  <article class="blog-entry" id="ai-playthrough-quest-warrior-dragon">
    <div class="blog-meta">
      <time class="blog-date" datetime="2026-10-22">Oct 22, 2026</time>
      <span class="blog-tag">Games</span>
      <span class="blog-tag">Autonomous Agents</span>
      <span class="blog-tag">Proof of Work</span>
    </div>
    <h2><a href="#ai-playthrough-quest-warrior-dragon">The Engine Plays Quest: Warrior Dragon: A Milestone-Driven AI Playthrough with Per-Milestone Videos, Checkpoints and a Tray Icon</a></h2>
    <p class="blog-summary">Proving every tile was reachable did not prove the game could be won. So we taught the robos-jrpg engine to play Quest: Warrior Dragon from King Lorik's throne room to the Dragonlord with real inputs only, cut the two-hour run into one video and one save checkpoint per milestone, added deadlock watchdogs on both sides of the IPC boundary, and put the whole thing in a GNOME tray icon so you can follow it without watching it.</p>
    <div class="blog-body">
      <p>The <a href="{{ '/games/quest-warrior-dragon/proof-of-viability.html' | relative_url }}">BFS proof of viability</a> was the first verification layer for the Quest: Warrior Dragon port: a headless walk over every connected <code>(map, col, row)</code> state that shows every chest, door, staircase and the Dragonlord's altar is reachable from the throne room. It caught real routing bugs. It also said nothing about whether the game is <em>beatable</em>. Can a level-1 hero with 120 gold earn the 1500 for a Broad Sword before the Swamp Cave kills him? Does the pack ever fill up so that a quest chest has to be skipped? Does Charlock's basement let you out again after Erdrick's Sword? Those are economy and combat-formula questions, and the only honest test is to play.</p>

      <figure class="blog-fig">
        <img src="{{ '/assets/games/quest-warrior-dragon/playthrough/filmstrip-milestone-videos.jpg' | relative_url }}" alt="Filmstrip: one frame from each of the 74 milestone videos of the winning run, with each clip's length" loading="lazy" style="object-fit:contain;max-height:none">
        <figcaption>One frame from each per-milestone video of the winning run, with the milestone id and clip length. Chests take a second; digging up Erdrick's Token took 22 minutes of grinding first.</figcaption>
      </figure>

      <h3>A brain that only wants the next milestone</h3>
      <p><code>PlayGameBrain.gd</code> is a "play the game" mode of the in-engine <code>AIEngine.gd</code>. It has exactly the affordances a human has: <code>move_up/down/left/right</code>, <code>ui_accept</code> and <code>cmd_menu</code>, and the state the game exposes through its IPC web service (<code>GameControlServer.gd</code>, <code>GET /api/v1/state</code>). No teleports, no stat edits, no reading hidden RNG. What makes it finish the game is not cleverness but a registry: <code>tools/gen_milestones.py</code> derives <code>data/v1/milestones.json</code>, an ordered list of 70 objectives, from the chest, shop, quest and level-curve data: every weapon, armor and shield purchase, every chest, each quest item, a level gate before each dangerous zone, the Dragonlord and the ending. Each entry says where to stand, which command to use, what level and gold are needed, and a <code>done_when</code> predicate. The brain always seeks the next unfinished one.</p>
      <ul>
        <li><strong>Routing:</strong> <code>RoutePlanner.gd</code> plans multi-map routes over the real walkability grids (stairs, doors, bridges, the Rainbow Bridge); the brain walks them with the same stride inputs the demo AI uses.</li>
        <li><strong>Survival:</strong> kill-before-die battle maths from <code>combat_formulas.json</code>, zone-aware heal thresholds (survive two worst-case hits from the local encounter pool), tiered HEAL / herb / HEALMORE, inn trips only when out of heal MP and herbs, herb restocks at every item shop, MP conservation inside Charlock and HEALMORE-only healing against the Dragonlord.</li>
        <li><strong>NES rules:</strong> eight tool slots, six per stack, no dropping; a full pack skips a non-gold chest rather than cheating around it.</li>
        <li><strong>Death-adaptive grinding:</strong> every death outside a grind raises the current milestone's required level by one, so a run that gets unlucky becomes more careful instead of repeating the mistake.</li>
      </ul>
      <div class="blog-fig-grid">
        <figure class="blog-fig">
          <img src="{{ '/assets/games/quest-warrior-dragon/playthrough/m01-throne-room-king-lorik.png' | relative_url }}" alt="Throne room: King Lorik tells how the Dragonlord stole the Ball of Light" loading="lazy">
          <figcaption>Milestone #1. The run starts exactly where a new game starts.</figcaption>
        </figure>
        <figure class="blog-fig">
          <img src="{{ '/assets/games/quest-warrior-dragon/playthrough/replay-m12-brecconary-shop-window.png' | relative_url }}" alt="Brecconary shop window with 112 gold" loading="lazy">
          <figcaption>The brain works a real shop menu with <code>ui_accept</code> and the cursor keys.</figcaption>
        </figure>
        <figure class="blog-fig">
          <img src="{{ '/assets/games/quest-warrior-dragon/playthrough/m29-garins-grave-b3-wolflord.png' | relative_url }}" alt="Wolflord battle with the FIGHT / SPELL menu" loading="lazy">
          <figcaption>A Wolflord: the battle policy has FIGHT and SPELL to choose from.</figcaption>
        </figure>
        <figure class="blog-fig">
          <img src="{{ '/assets/games/quest-warrior-dragon/playthrough/m41-mountain-cave-items-pack.png' | relative_url }}" alt="The ITEMS window in Erdrick's Cave: Torch x2, Leather Armor, Small Shield, Copper Sword" loading="lazy">
          <figcaption>The ITEMS window. Herbs and torches stack to six; before that fix they filled all eight slots.</figcaption>
        </figure>
      </div>

      <h3>The visibility problem of a two-hour run</h3>
      <p>At time-scale 8 a full run takes about two hours and roughly 800 random battles. Nobody watches that, and a single two-hour MP4 is nearly useless when you want to know why milestone 42 took ten minutes. So the Python driver (<code>tests/e2e/play_full_game.py</code>) got a <code>--stepped</code> mode: it cuts the ffmpeg capture at every milestone boundary into <code>videos/NN-&lt;id&gt;.mp4</code>, asks the game to <code>export_save_state</code> into <code>checkpoints/NN-&lt;id&gt;.json</code>, and saves <code>screenshots/NN-&lt;id&gt;.png</code>. Because every milestone has a checkpoint, <code>--only N</code> loads checkpoint N-1 and replays just that milestone, so a fix to the Kol item shop can be verified in twenty seconds instead of ninety minutes. <code>--from N</code> resumes a run from a checkpoint to the ending.</p>
      <p>Then the tray icon. Stepped and recorded runs now start <code>tools/playthrough-dashboard</code>, a small Electron app that reads the <code>live.json</code> the driver rewrites once a second. In the GNOME top bar it draws a 32-pixel progress ring (cyan running, green done, red crashed or stalled) whose context menu, rebuilt every three seconds, shows status, done/total milestones, level, HP, gold, battles, deaths, the current milestone and the brain's sub-objective, plus <em>Open latest milestone video</em> and <em>Stop run</em> (which sends <code>stop_play_game</code> over IPC). Click it and the dashboard window opens.</p>
      <figure class="blog-fig">
        <img src="{{ '/assets/games/quest-warrior-dragon/playthrough/tray-menu.png' | relative_url }}" alt="GNOME top bar with the Game Playthrough tray icon and its context menu after the winning run" loading="lazy" style="object-fit:contain;max-height:none">
        <figcaption>The tray icon and its menu after the winning run: 74 / 74 milestones, level 21, 2,621 battles, 6 deaths.</figcaption>
      </figure>
      <figure class="blog-fig">
        <img src="{{ '/assets/games/quest-warrior-dragon/playthrough/dashboard-live.png' | relative_url }}" alt="Game Playthrough live view after the winning run: 74 / 74 milestones and the closing credits" loading="lazy" style="object-fit:contain;max-height:none">
        <figcaption>The live view at the end of the winning run. Left: all 74 milestones with their type and whether a checkpoint exists. Right: the game screen, battle, equipment and pack, AI inputs and the brain's event log.</figcaption>
      </figure>
      <p>Every finished milestone in the list is a card. Click it and the dashboard plays that milestone's video, shows the checkpoint saved right after it (location, level, EXP, gold, HP/MP, ATK/DEF, equipment), the milestone screenshot, and a <em>Replay command</em> button that copies the exact <code>--stepped --only N</code> command line. Reviewing a run became: skim the filmstrip, click the milestone that looks slow, watch sixty seconds, read the checkpoint.</p>
      <div class="blog-fig-grid">
        <figure class="blog-fig">
          <img src="{{ '/assets/games/quest-warrior-dragon/playthrough/dashboard-milestone-1.png' | relative_url }}" alt="Milestone card #1 Hear King Lorik's quest with its video and the checkpoint: ThroneRoom, level 1" loading="lazy">
          <figcaption>#1 Hear King Lorik's quest: a four-second clip and the first checkpoint.</figcaption>
        </figure>
        <figure class="blog-fig">
          <img src="{{ '/assets/games/quest-warrior-dragon/playthrough/dashboard-milestone-31.png' | relative_url }}" alt="Milestone card #31 Grind + Reach level 10 with its video and checkpoint: WorldMap (6,60), level 10, 617 gold" loading="lazy">
          <figcaption>#31 Reach level 10 (STOPSPELL): 143 seconds on the overworld, checkpoint at 617 gold.</figcaption>
        </figure>
        <figure class="blog-fig">
          <img src="{{ '/assets/games/quest-warrior-dragon/playthrough/dashboard-milestone-41.png' | relative_url }}" alt="Milestone card #41 Rescue Princess Gwaelin with a Wolf battle frame and checkpoint: SwampCave (3,22), level 11" loading="lazy">
          <figcaption>#41 Rescue Princess Gwaelin: the Swamp Cave clip and its checkpoint.</figcaption>
        </figure>
        <figure class="blog-fig">
          <img src="{{ '/assets/games/quest-warrior-dragon/playthrough/dashboard-milestone-39.png' | relative_url }}" alt="Milestone card #39 Grind + Buy Broad Sword at Rimuldar with its video and checkpoint: broad_sword, 746 gold" loading="lazy">
          <figcaption>#39 Buy Broad Sword: the checkpoint confirms <code>broad_sword</code> equipped with 746 gold left.</figcaption>
        </figure>
      </div>

      <h3>Two watchdogs, one on each side of the wire</h3>
      <p>Autonomous runs do not fail loudly; they stall. The brain got a wall-clock progress watchdog: 90 seconds with no change in milestone, battle count, level, gold, map, tile, herbs or HP and it drops the current objective and plan, blacklists an unreachable supply shop, and after three stalls on the same milestone skips it if optional or fails the run. The driver got <code>--stall-timeout</code> (600 s by default): when the done-count, battles, level, gold and EXP all stop moving, it ends the run with status <code>stalled</code>, a <code>stall.png</code> and the tail of the brain's event log. The first thing the pair caught was a wandering villager in Kol who parked himself in the one-tile item-shop doorway and deadlocked the herb restock forever.</p>
      <div class="blog-fig-grid">
        <figure class="blog-fig">
          <img src="{{ '/assets/games/quest-warrior-dragon/playthrough/m33-kol-chest.png' | relative_url }}" alt="Kol village with the command menu open at a chest" loading="lazy">
          <figcaption>Kol. The NPC that blocked the item-shop door now wanders elsewhere, and shop retries are capped.</figcaption>
        </figure>
        <figure class="blog-fig">
          <img src="{{ '/assets/games/quest-warrior-dragon/playthrough/v-hurt-spell-skeleton.png' | relative_url }}" alt="Battle spell list with HURT selected against a Druin" loading="lazy">
          <figcaption>HURT picked from the battle spell list. The battle policy casts when a spell is cheaper than the sword rounds it saves.</figcaption>
        </figure>
      </div>

      <h3>Every bug it hit was a game bug</h3>
      <p>The rule in the game's <code>AGENTS.md</code> is "fix the game, not the brain", and it held. The playthrough found the Charlock 1F exit gate unwalkable (reachable on the BFS grid, impassable in play), boss fights not syncing the pack, duplicate chests, missing level-up curves, incorrect enemy flee factors and spell resistances, a Cantlin item shop with no stock, Wings that did nothing on the overworld, consumables that refused to stack, and a Magic Armor / Erdrick's Armor tie that made the brain re-buy armor it already outclassed. None of these were visible to the BFS audit or to the chained Cucumber checkpoints, because they only appear when a hero with the real economy and real stats tries to progress.</p>
      <div class="blog-fig-grid">
        <figure class="blog-fig">
          <img src="{{ '/assets/games/quest-warrior-dragon/playthrough/m19-erdricks-cave-b2-tablet.png' | relative_url }}" alt="Erdrick's Cave B2 in darkness with a one-tile torch radius" loading="lazy">
          <figcaption>Erdrick's Cave in the dark. The brain buys torches before every dark dungeon until it knows RADIANT.</figcaption>
        </figure>
        <figure class="blog-fig">
          <img src="{{ '/assets/games/quest-warrior-dragon/playthrough/m44-swamp-cave-gwaelin.png' | relative_url }}" alt="Swamp Cave: Princess Gwaelin asks to be taken back to her father" loading="lazy">
          <figcaption>Gwaelin's cell at level 11.</figcaption>
        </figure>
        <figure class="blog-fig">
          <img src="{{ '/assets/games/quest-warrior-dragon/playthrough/m45-rimuldar-wings-chest.png' | relative_url }}" alt="Rimuldar: Thou dost find the Wings!" loading="lazy">
          <figcaption>Wings from Rimuldar, the brain's way home from Charlock when its MP commit bar is short.</figcaption>
        </figure>
        <figure class="blog-fig">
          <img src="{{ '/assets/games/quest-warrior-dragon/playthrough/m50-northern-cave-staff-of-rain.png' | relative_url }}" alt="Northern shrine, the Staff of Rain chest" loading="lazy">
          <figcaption>Staff of Rain in the northern shrine.</figcaption>
        </figure>
      </div>

      <h3>Results, and how to run it</h3>
      <p>With the game data fixed, the brain clears all 70 milestones and beats the Dragonlord at level 21–22 in one or two Charlock expeditions with at most a single death; the screenshots in this post are from a later run that cleared all 74 milestones with 2,621 battles and 6 deaths. The <code>playthrough.json</code> report, the per-milestone videos and the checkpoints are the proof of work. To try it: <code>python3 games/quest-warrior-dragon/tests/e2e/play_full_game.py --stepped</code> runs the whole game headless with the tray icon and dashboard; <code>--until 18</code> stops after the Copper Sword, <code>--only 42</code> replays one milestone, <code>DW_HEADED=1</code> shows the game on your desktop. The dashboard also runs on its own against any reports folder (<code>npx electron --no-sandbox . --reports ... --port ...</code>) and has <code>--snapshot out.png</code> and <code>--select N</code> flags so headless agents can screenshot it, which is how the dashboard images in this post were taken.</p>
      <div class="blog-fig-grid">
        <figure class="blog-fig">
          <img src="{{ '/assets/games/quest-warrior-dragon/playthrough/m38-level-10-desert.png' | relative_url }}" alt="Desert overworld while grinding for level 15" loading="lazy">
          <figcaption>The desert on the way to level 15.</figcaption>
        </figure>
        <figure class="blog-fig">
          <img src="{{ '/assets/games/quest-warrior-dragon/playthrough/m47-return-gwaelin-king-lorik.png' | relative_url }}" alt="King Lorik: Thou hast rescued my daughter Gwaelin! I am forever grateful." loading="lazy">
          <figcaption>Gwaelin returned to King Lorik.</figcaption>
        </figure>
      </div>
    </div>
    <div class="blog-links">
      <a href="{{ '/games/quest-warrior-dragon/ai-playthrough/' | relative_url }}">AI Playthrough docs, dashboard walkthrough and full gallery →</a>
      <a href="{{ '/games/quest-warrior-dragon/' | relative_url }}">Quest: Warrior Dragon game page →</a>
      <a href="{{ '/v1/projects/quest-warrior-dragon/' | relative_url }}">Engine &amp; architecture guide →</a>
      <span class="blog-commits">Commits: 489d3d67 · f8369a3e · db03cfd8 · 10f31281 · 528bdc62 · 72d4225d</span>
    </div>
  </article>

  <article class="blog-entry" id="audio-player-virtual-dj">
    <div class="blog-meta">
      <time class="blog-date" datetime="2026-10-21">Oct 21, 2026</time>
      <span class="blog-tag">Audio Player</span>
      <span class="blog-tag">Virtual DJ</span>
      <span class="blog-tag">Google Cast</span>
    </div>
    <h2><a href="#audio-player-virtual-dj">Audio Player: AI Playlists, a Virtual DJ You Can Hear, and Casting That Keeps Time</a></h2>
    <p class="blog-summary">The RobOS Audio Player now browses a 100,000-song library, keeps a VLC-style play queue on screen, builds playlists with your RobOS agent and puts a Virtual DJ between songs, on your desk or on a Google Cast speaker. Most of the work after the first version went into making the DJ loud enough to hear and the speaker keep time.</p>
    <div class="blog-body">
      <p>The <strong>library</strong> groups music into albums, artists, genres, decades and composers, sorts names the way people expect ("Track 2" before "Track 10", "The Beatles" under B) and only draws the rows on screen, so a 100,000-song library stays smooth. Songs in Google Drive or OneDrive get their real artist and album without being downloaded: the player fetches only the bytes that hold the tags (the ID3 tag at the start of an MP3, FLAC's metadata blocks, an M4A's <code>moov</code> box wherever it sits) and guesses from folder names until then.</p>
      <p><strong>AI Playlists</strong>: describe what you want ("late-night jazz and moody electronic for coding") and your RobOS agent picks and orders songs from your library. The agent is chosen with the same <code>&lt;robos-agent-selector&gt;</code> PR Review uses, so it defaults to whichever agent you have installed and signed in. Tick <strong>Virtual DJ</strong>, describe a host, and the agent writes a short intro for each song, a few songs ahead, spoken with RobOS Voice. The speaker button in the queue (or right-click → <em>Announce this song</em>) plays the intro the DJ has ready, so you can hear it before the song ends.</p>
      <p>The first version worked on paper and failed in the kitchen. What we fixed:</p>
      <ul>
        <li><strong>The DJ was a whisper.</strong> Voice engines produce speech far quieter than mastered music, and a Cast speaker plays the DJ at the music's volume, so turning the DJ up had to happen in the audio itself. Each line is now loudness-normalised to music level (−14 LUFS), set to a new <strong>DJ volume</strong> (default 150%, about 3.5 dB louder than a typical song) and run through a limiter, then saved as MP3 for both the computer and the speaker.</li>
        <li><strong>"No text-to-speech engine produced audio."</strong> Kokoro loads its model on first use and the first line gave up after 12 seconds. The fallback then handed Edge-TTS a Kokoro voice name it rejects. The voice engine now starts as soon as the DJ is on, DJ lines may wait 60 seconds, each fallback engine uses its own voice, and the message names what failed for each engine.</li>
        <li><strong>The speaker stopped and restarted between songs.</strong> Every song shut down the speaker's Cast app and launched it again. A muted local copy of the song also sent the song again whenever it started playing, so each song was loaded at least twice. One receiver session now stays open, and each song is sent once.</li>
        <li><strong>The progress bar sat at 00:00.</strong> It followed that muted local copy, which for a cloud song might never load. While casting, the speaker is now the clock: the app asks for its position every second, and the progress bars, play counts, synced lyrics and the move to the next song all follow it. Dragging the bar seeks the speaker.</li>
        <li><strong>Speakers refused some DJ lines.</strong> Every file went out labelled as MP3, including WAV voice clips, and the voice cache stores MP3s under <code>.wav</code> names. Files are now typed by their first bytes.</li>
      </ul>
      <p>Smaller things from the same stretch: dividers and table columns can be dragged to resize, and the sizes are remembered. Lyrics have an on/off switch and a <strong>Follow</strong> button that keeps the current line in view until you scroll yourself.</p>
      <p>Unit tests cover tag reading from synthetic MP3, FLAC and M4A layouts, ranged reads from a fake Drive, Cast session reuse, the speaker's position reports and file typing. The DJ and casting screens were exercised in headless Chromium against a scripted Cast speaker.</p>
      <div class="blog-fig-grid">
        <figure class="blog-fig">
          <img src="{{ '/assets/audio-player/virtual-dj-volume.jpg' | relative_url }}" alt="Virtual DJ dialog with the AI agent set to AGY, a DJ description, the voice, how often the DJ talks and a DJ volume slider at 150% of the music" loading="lazy">
          <figcaption>Virtual DJ settings: the agent writes the lines, RobOS Voice speaks them, and DJ volume sets how loud they are next to the music.</figcaption>
        </figure>
        <figure class="blog-fig">
          <img src="{{ '/assets/audio-player/casting-deck.jpg' | relative_url }}" alt="Now Playing deck casting to a kitchen speaker, with the progress bar at 0:32 of 3:20 and the pause button" loading="lazy">
          <figcaption>Casting to a speaker: the progress bar and the pause button follow what the speaker reports.</figcaption>
        </figure>
      </div>
    </div>
    <div class="blog-links">
      <a href="{{ '/v1/apps/audio-player/' | relative_url }}">Read the Audio Player docs →</a>
      <span class="blog-commits">Commits: 8fc7f3e7 · 9eeb693c · caab95f4 · e8f3c510 · d7bd7562 · 9f2a7b1b · b173e919 · 3c3884cd</span>
    </div>
  </article>

  <article class="blog-entry" id="auto-center-obd">
    <div class="blog-meta">
      <time class="blog-date" datetime="2026-10-21">Oct 21, 2026</time>
      <span class="blog-tag">Auto Center</span>
      <span class="blog-tag">OBD-II</span>
      <span class="blog-tag">Bluetooth</span>
    </div>
    <h2><a href="#auto-center-obd">Auto Center Reads the Car: Bluetooth OBD-II at the Mechanic Bench</a></h2>
    <p class="blog-summary">Plug a $30 Bluetooth OBD-II adapter into the port under the dash and the mechanic bench reads the check-engine light, trouble codes, the VIN and live engine data, then saves the scan on the work ticket. We built it against a real van with a vLinker MC+ plugged in.</p>
    <div class="blog-body">
      <p>Until now Auto Center knew what trouble codes <em>mean</em> (the python-OBD definitions are in its catalog) but a mechanic still had to read them off a separate scan tool and type them in. A ticket on the <strong>Mechanic Bench</strong> now has a <strong>Read the car (OBD)</strong> panel that talks to any ELM327-compatible Bluetooth adapter: vLinker, OBDLink, Veepeak, Vgate and the many clones.</p>
      <ul>
        <li><strong>Read codes:</strong> the check-engine light, stored, pending and permanent codes with their descriptions, the VIN and the model year it encodes. Engine and transmission codes are labeled by module.</li>
        <li><strong>On the ticket:</strong> <strong>Save scan to ticket</strong> writes what the car reported into the ticket history. If the vehicle has no VIN on file, the VIN read from the car fills it in. If the car's VIN does not match the ticket, the bench says you are plugged into the wrong car and will not save the scan. <strong>Use codes in diagnosis</strong> opens the diagnosis with the codes already filled in.</li>
        <li><strong>Live data:</strong> engine speed, coolant and intake temperature, battery voltage, load, throttle, fuel level, fuel trims, speed and time since start, about once a second. Only readings the car reports as supported are asked for.</li>
        <li><strong>Clearing codes</strong> asks first. Clearing also resets the emissions readiness checks, so a car cleared just before an inspection will fail it.</li>
      </ul>
      <p>Under the hood, <code>lib/obd.js</code> frames the adapter's replies for CAN (11- and 29-bit, including multi-frame replies like the VIN) and the older J1850, ISO 9141 and KWP buses. Node has no Bluetooth serial sockets, so a 60-line <code>obd_bridge.py</code> uses the Bluetooth support built into Python and passes commands over stdin and stdout. There are no native modules to build.</p>
      <p>Testing on a real 2014 Dodge Grand Caravan turned up things a datasheet would not tell you. The first read failed with <code>UNABLE TO CONNECT</code> even though the adapter's lights were flashing, because the OBD port is powered with the key off but the engine computer is asleep. The bench now says "turn the key to ON" and has a <strong>Try the car again</strong> button. The vLinker MC+ shows up as two Bluetooth devices: <code>vLinker MC-Android</code> (classic serial, which is what we use) and <code>vLinker MC-IOS</code> (Bluetooth LE). The scan hides the LE one. Bluetooth pairing failed, but none is needed. A few minutes after power-up the adapter stopped showing up in scans while still accepting connections, so the bench remembers your adapter for a one-click reconnect. It also remembers the car's protocol, which cut reconnecting from 11 to 7 seconds.</p>
      <p>A second car, a 2005 Honda Accord, uses the older ISO 9141-2 bus, where each line is a complete frame with its own checksum and the VIN arrives in five pieces. It read cleanly on the first try. Its owner expected a code from a light seen days earlier, but the car reported the light off, no stored or pending codes and every readiness check complete. That is why the guide now says which warning lights a generic adapter cannot see: airbag, ABS and most transmission warnings live in other computers.</p>
      <p>The tests replay verbatim recordings of both cars through the real app, with the VINs replaced. <code>ROBOS_AUTO_OBD_RECORD</code> records another car the same way, and <code>E2E_OBD_LIVE=1</code> runs the scenarios against a real adapter.</p>
      <p>The same release changes how shop vehicles are named. Instead of a free-text name like "Sam's Camry", every screen shows make, model and year followed by the customer, such as <em>Honda Accord 2005 — Jim Parker</em>, with an optional nickname in brackets.</p>
      <div class="blog-fig-grid">
        <figure class="blog-fig">
          <img src="{{ '/assets/blog/auto-center-obd/read-codes.jpg' | relative_url }}" alt="Mechanic bench Read the car panel connected to a vLinker MC-Android adapter, showing the VIN, check-engine light on, stored codes P0133 and P0420 and pending code P0442" loading="lazy">
          <figcaption>Read codes on the recorded van, with a check-engine light added for testing. Descriptions come from the catalog.</figcaption>
        </figure>
        <figure class="blog-fig">
          <img src="{{ '/assets/blog/auto-center-obd/accord-live-data.jpg' | relative_url }}" alt="Live engine data read over a vLinker MC+ from a running 2005 Honda Accord: 791 rpm, coolant 156 °F, load 38 percent, fuel trims, with the check-engine light off" loading="lazy">
          <figcaption>Captured from the app while connected to a running 2005 Honda Accord (VIN blurred).</figcaption>
        </figure>
      </div>
    </div>
    <div class="blog-links">
      <a href="{{ '/auto-center/' | relative_url }}">Read the Auto Center shop &amp; owner guide →</a>
      <span class="blog-commits">Commits: b1c62e83 · d39442b9 · a1d709a6</span>
    </div>
  </article>

  <article class="blog-entry" id="cli-agents-and-api-mode">
    <div class="blog-meta">
      <time class="blog-date" datetime="2026-10-21">Oct 20 – Oct 21, 2026</time>
      <span class="blog-tag">AI Agents</span>
      <span class="blog-tag">LangChain.js</span>
      <span class="blog-tag">Security</span>
    </div>
    <h2><a href="#cli-agents-and-api-mode">Bring Your Own Agent CLI: An Optional API Mode, and Why We Removed the Harness Router</a></h2>
    <p class="blog-summary">RobOS keeps running the coding-agent CLIs you already use. We added an opt-in API mode through LangChain.js for quick requests, local Ollama models and semantic Knowledge Graph search, and deleted the Unified Harness Protocol router that nothing actually used.</p>
    <div class="blog-body">
      <p>The question was whether RobOS should adopt LangChain. Almost all of its AI work already goes to Claude Code, Codex, Gemini CLI / Antigravity or GitHub Copilot, which bring their own tool loops, models and sign-in. Putting a second agent runtime underneath them would duplicate that. So the rule is: install a CLI, sign in, and RobOS works. Direct model APIs are an option, never a requirement.</p>
      <ul>
        <li><strong>One switch point:</strong> every one-shot AI request in the apps goes through <code>robos-lib/ai-agent</code>, which runs the CLI you set as active in RobOS Agents. Gemini CLI / Antigravity joins Copilot, Claude Code and Codex as a supported provider, and Software Center can now install it.</li>
        <li><strong>Optional API mode (<code>packages/robos-llm</code>):</strong> off by default. Turn it on in RobOS Preferences and quick requests go to Anthropic, OpenAI, Google Gemini or a local Ollama server through LangChain.js, falling back to your CLI if the call fails. The LangChain packages are not shipped with RobOS; Preferences installs them on request into <code>~/.local/share/robos/llm-deps</code>. API keys live only in <code>pass</code>, keys that older versions saved as plain text are moved there, and LangSmith tracing is forced off.</li>
        <li><strong>Stubs that now do real work:</strong> the <strong>?</strong> quick-ask button in the AI text box was not wired into any app; it now answers in AI Prompt Studio, Git Projects and the Knowledge Graph Explorer. The Graph Explorer's AI Co-Pilot used to pick nodes by keyword; it now asks your agent and checks the answer against the SHACL shapes. Import &amp; Refine's <strong>Ask AI agent</strong> works with any signed-in CLI instead of needing a router server.</li>
        <li><strong>Semantic Knowledge Graph search:</strong> with API mode on, <code>kgraph search --engine semantic</code> and the <code>robos_kgraph_semantic_search</code> MCP tool rank nodes by meaning, using embeddings from OpenAI, Gemini or Ollama and a local vector index that only re-embeds changed nodes.</li>
        <li><strong>Removing the harness router:</strong> no app ran real work through <code>robos-agent-client/harness-router.js</code>. Its in-process fallback passed prompts through a shell, so quotes or <code>$(...)</code> in a prompt could run commands, and it reported success for three of its six harnesses without starting anything. We deleted it, the unused session layer and the Agents Manager panel, about 3,600 lines of code and docs. The prompt security scan moved into <code>ai-agent</code>, so every one-shot prompt is checked before it reaches a CLI or an API.</li>
      </ul>
      <p>Still open: answers arrive in one piece rather than streaming, and Task Implementer and Dev Central start their CLIs without the prompt scan.</p>
      <figure class="blog-fig">
        <img src="{{ '/v1/assets/images/screenshots/ai-api-mode-preferences.png' | relative_url }}" alt="RobOS Preferences, AI Agents and API Mode section, with API mode on, Google Gemini selected, a key saved in pass, and Ollama embeddings for semantic search" loading="lazy">
        <figcaption>The new AI Agents &amp; API Mode section in RobOS Preferences. Key fields save straight to <code>pass</code>.</figcaption>
      </figure>
    </div>
    <div class="blog-links">
      <a href="{{ '/v1/ai-providers.html' | relative_url }}">AI agents and API mode →</a>
      <a href="{{ '/v1/agent-tiers.html' | relative_url }}">How tasks reach an agent CLI →</a>
      <span class="blog-commits">Commits: ac06cf5 · 232afef</span>
    </div>
  </article>

  <article class="blog-entry" id="cloud-storage-and-audio-suite">
    <div class="blog-meta">
      <time class="blog-date" datetime="2026-10-20">Oct 14 – Oct 20, 2026</time>
      <span class="blog-tag">Data Sources</span>
      <span class="blog-tag">Audio Player</span>
      <span class="blog-tag">Smart Home</span>
    </div>
    <h2><a href="#cloud-storage-and-audio-suite">Cloud Storage &amp; Data Sources Overhaul, RobOS Audio Player, and Home Speaker</a></h2>
    <p class="blog-summary">Unified local, FTP, SFTP, and live Google Drive OAuth 2.0 folder mounting in Data Sources, and built a desktop Audio Player and Home Speaker intercom suite with zero-cloud Google Cast streaming.</p>
    <div class="blog-body">
      <p>Connecting external storage and media libraries across desktop apps required too much manual form entry. We overhauled <strong>Cloud Storage &amp; Data Sources</strong> (<code>packages/data-sources</code>) around a guided 3-step connection wizard with real Google OAuth 2.0 browser sign-in, live Google Drive API folder mounting, top-right authentication status toasts, and native FTP/SFTP storage drivers alongside PostgreSQL schema inspection.</p>
      <ul>
        <li><strong>Managed Library Folders:</strong> <strong>RobOS Audio Player</strong> (<code>packages/audio-player</code>) mounts local directories, FTP servers, and SFTP shares as managed libraries with one-click sync, rename, and removal. Folder scanning runs on a background worker thread so large music libraries never stall the UI.</li>
        <li><strong>Playlists, Synced Lyrics &amp; Amber Library View:</strong> Added a sortable, list-based library view with a warm amber palette, synced lyric display, M3U playlist import/export, and Howler.js + H5AudioPlayer playback.</li>
        <li><strong>Local Cast &amp; Home Speaker Intercom:</strong> Built zero-cloud Google Home / Cast discovery and streaming directly from the Now Playing deck, plus the companion <strong>RobOS Home Speaker</strong> app (<code>packages/home-speaker</code>) for push-to-talk intercom broadcasts, neural TTS announcements, and scheduled chimes.</li>
      </ul>
      <figure class="blog-fig">
        <img src="{{ '/v1/assets/images/audio-player-playlist-architecture.jpg' | relative_url }}" alt="RobOS Audio Player and Home Speaker playlist and Cast streaming architecture" loading="lazy">
        <figcaption>RobOS Audio Player library management, background metadata worker, and local Cast streaming pipeline.</figcaption>
      </figure>
    </div>
    <div class="blog-links">
      <a href="{{ '/apps/' | relative_url }}">Browse Audio &amp; Data Sources apps →</a>
      <span class="blog-commits">Commits: f8bbcede · 073d9bc1 · 87319217 · 426eaad4 · 7af920a2</span>
    </div>
  </article>

  <article class="blog-entry" id="tabletop-rpg-and-election-2026">
    <div class="blog-meta">
      <time class="blog-date" datetime="2026-10-20">Oct 1 – Oct 20, 2026</time>
      <span class="blog-tag">Godot 4</span>
      <span class="blog-tag">Tabletop RPG</span>
      <span class="blog-tag">Game Authoring</span>
    </div>
    <h2><a href="#tabletop-rpg-and-election-2026">Tabletop RPG Engine, Two-Layer Map Studio, and the "Midterm Elections 2026" Campaign</a></h2>
    <p class="blog-summary">Built a HeroQuest-inspired tactical dungeon crawler in Godot 4, a two-layer blockmap and quest authoring suite, autonomous Mentor-vs-Zargon AI playthrough verification, and a voiced satirical Midterm Elections 2026 campaign pack.</p>
    <div class="blog-body">
      <p>To make classic grid-based tabletop dungeon crawlers fast to author and verify, we split level design into two distinct layers and paired them with a deterministic Godot 4 tactical engine (<code>games/tabletop-rpg</code>) and <strong>RobOS Tabletop Studio</strong> (<code>packages/robos-tabletop</code>):</p>
      <ul>
        <li><strong>Layer 1 — Tabletop Blockmap Creator (<code>packages/tabletop-blockmap-creator</code>):</strong> Calibrates tile size and X/Y offsets over any board artwork, supports freeform contiguous room painting and corridor geometry, and saves reusable static blockmaps.</li>
        <li><strong>Layer 2 — Tabletop Quest Map Editor (<code>packages/tabletop-quest-editor</code>):</strong> Places single and 2×1/1×2 double doors, monsters, furniture, traps, secret doors, border stairs, and recursive event/action dialogue triggers. Exports playable <code>.cartridge</code> bundles as well as high-resolution PNG and printable PDF quest sheets.</li>
        <li><strong>Tactical Rules, Raycasted Fog of War &amp; GPU Optimization:</strong> Implemented authentic raycasted line-of-sight room reveals, permanently visible unreachable non-room tiles, A* monster pathfinding, skull-and-shield combat dice trays, Dwarf trap disarming, parchment treasure cards, and KGraph save-state telemetry—while eliminating a 4-second GPU frame readback stall on turn transitions.</li>
        <li><strong>Autonomous Playthroughs &amp; Midterm Elections 2026 Pack:</strong> Built an autonomous Mentor Party vs. Zargon AI harness that plays full quests end-to-end and emits an HTML Proof of Viability ledger. Topped it off with the <em>Midterm Elections 2026</em> campaign featuring a Capitol Oval Office blockmap, 24 satirical enemies and spells, multi-headed Hydra bosses, Oval Office intro and victory movies, custom hero tokens, and 40+ situation-specific voice lines across turn start, movement, attack, reaction, and death triggers.</li>
      </ul>
      <div class="blog-fig-grid">
        <figure class="blog-fig">
          <img src="{{ '/assets/games/tabletop-bg-poster.jpg' | relative_url }}" alt="RobOS Tabletop RPG dungeon board with tactical miniatures and HUD" loading="lazy">
          <figcaption>Tactical dungeon crawl in the Godot 4 Tabletop RPG engine with raycasted fog of war.</figcaption>
        </figure>
        <figure class="blog-fig">
          <img src="{{ '/assets/games/proof-of-viability/m06_boss_room_breach.jpg' | relative_url }}" alt="Boss room breach captured during an autonomous Mentor vs Zargon playthrough" loading="lazy">
          <figcaption>Turn-by-turn screenshot evidence from the autonomous Proof of Viability playthrough.</figcaption>
        </figure>
      </div>
    </div>
    <div class="blog-links">
      <a href="{{ '/games/tabletop-rpg/' | relative_url }}">Explore Tabletop RPG →</a>
      <a href="{{ '/games/tabletop-rpg/proof-of-viability.html' | relative_url }}">View Proof of Viability report →</a>
      <span class="blog-commits">Commits: 77aa08b4 · fc5b3838 · 0f14c618 · fe838029 · 8db1de00</span>
    </div>
  </article>

  <article class="blog-entry" id="robos-household-and-tax-prep">
    <div class="blog-meta">
      <time class="blog-date" datetime="2026-10-19">Oct 19, 2026</time>
      <span class="blog-tag">RobOS Household</span>
      <span class="blog-tag">Personal Finance</span>
      <span class="blog-tag">Tax Engine</span>
    </div>
    <h2><a href="#robos-household-and-tax-prep">RobOS Household: Full-Year Family Accounting and Open-Source Tax Preparation</a></h2>
    <p class="blog-summary">Defined the public Household and Tax KGraph schema package and built RobOS Household to take a family from twelve months of bank and card CSV statements through W-2 PDF verification and local federal tax estimation.</p>
    <div class="blog-body">
      <p>Personal finance and tax preparation software usually locks family records inside proprietary cloud silos. We defined the <code>robos:Household</code> and public tax schema package and built <strong>RobOS Household</strong> (<code>packages/household</code>) around five recurring workspaces: <em>Family</em>, <em>Accounts</em>, <em>Spending</em>, <em>Taxes</em>, and <em>Privacy</em>.</p>
      <ul>
        <li><strong>Reconciled Multi-Account Ledger:</strong> Tested against a full synthetic family financial year across checking, savings, credit card, auto loan, investment, and cash CSV statements (318 transactions), verifying closing balances, idempotent re-imports, category corrections, and split purchases.</li>
        <li><strong>Side-by-Side PDF Field Review:</strong> Uses PDF.js to extract text and page coordinates from W-2 and 1099-INT forms, highlighting source fields side-by-side and blocking tax calculation until ambiguous OCR/text fields are human-reviewed and approved.</li>
        <li><strong>Local TenForty + OpenTaxSolver Calculation:</strong> Computes federal taxable income, standard deductions, and child tax credit supplements locally via TenForty and OpenTaxSolver while enforcing strict privacy and non-filing boundaries.</li>
      </ul>
      <div class="blog-fig-grid">
        <figure class="blog-fig">
          <img src="{{ '/assets/family-finances/02-accounts.png' | relative_url }}" alt="Six reconciled family accounts and net worth summary in RobOS Household" loading="lazy">
          <figcaption>Six reconciled accounts and 318 imported transactions in the Household sandbox.</figcaption>
        </figure>
        <figure class="blog-fig">
          <img src="{{ '/assets/family-finances/05-field-review.png' | relative_url }}" alt="Side-by-side W-2 PDF inspection and critical field verification" loading="lazy">
          <figcaption>Side-by-side W-2 source field highlighting and human verification before tax calculation.</figcaption>
        </figure>
      </div>
    </div>
    <div class="blog-links">
      <a href="{{ '/family-finances/' | relative_url }}">Read the Family Finances walkthrough →</a>
      <span class="blog-commits">Commits: 336fa2f2 · 6163f44e · 96650d32 · 53b8c941</span>
    </div>
  </article>

  <article class="blog-entry" id="point-of-sale">
    <div class="blog-meta">
      <time class="blog-date" datetime="2026-10-19">Oct 17 – Oct 19, 2026</time>
      <span class="blog-tag">Point of Sale</span>
      <span class="blog-tag">Small Business</span>
      <span class="blog-tag">Barcode &amp; QR Vision</span>
    </div>
    <h2><a href="#point-of-sale">RobOS Point of Sale: Open-Source Register &amp; Self-Checkout for Retail, Cafés, and Bars</a></h2>
    <p class="blog-summary">Shipped a touchscreen cash register, customer self-checkout kiosk, prep queue, cash drawer manager, and hardware scan-gun + webcam barcode/QR scanner with ready-to-run Retail, Coffee Shop, and Bar workflows.</p>
    <div class="blog-body">
      <p>Small retail shops, cafés, and bars often pay steep monthly fees for basic register software. We built <strong>RobOS Point of Sale</strong> (<code>packages/point-of-sale</code>) as a free, open-source register and self-checkout suite with an open checkout-session API and three complete sample businesses:</p>
      <ul>
        <li><strong>Retail Store:</strong> SKU catalog and inventory tracking, promotional discounts, manager PIN overrides, and hardware scan-gun or webcam scanning across UPC-A, EAN-13, EAN-8, QR, DataMatrix, and Aztec codes.</li>
        <li><strong>Coffee Shop:</strong> Touchscreen counter register, customer self-checkout kiosk with drink modifiers, live barista prep queue, ready-board announcements, and opening/closing cash drawer counts.</li>
        <li><strong>Bar:</strong> Open bar tabs, automatic happy-hour pricing rules, multi-guest split payments, tip prompts, and itemized receipts.</li>
      </ul>
      <div class="blog-fig-grid">
        <figure class="blog-fig">
          <img src="{{ '/assets/point-of-sale/coffee-register-latte.jpg' | relative_url }}" alt="Coffee shop touchscreen order entry in RobOS Point of Sale" loading="lazy">
          <figcaption>Worker touchscreen register for café orders, modifiers, and cash/card checkout.</figcaption>
        </figure>
        <figure class="blog-fig">
          <img src="{{ '/assets/point-of-sale/bar-open-tabs.jpg' | relative_url }}" alt="Bar open tabs and split payment view in RobOS Point of Sale" loading="lazy">
          <figcaption>Bar tab management with happy-hour pricing and split payment support.</figcaption>
        </figure>
      </div>
    </div>
    <div class="blog-links">
      <a href="{{ '/point-of-sale/' | relative_url }}">Explore the Point of Sale guide &amp; business tutorials →</a>
      <span class="blog-commits">Commits: b08629e4 · 922778de · 369c099d · 5f99b7be · 3984bafb</span>
    </div>
  </article>

  <article class="blog-entry" id="auto-center">
    <div class="blog-meta">
      <time class="blog-date" datetime="2026-10-19">Oct 15 – Oct 19, 2026</time>
      <span class="blog-tag">Auto Center</span>
      <span class="blog-tag">Small Business</span>
      <span class="blog-tag">Cucumber E2E</span>
    </div>
    <h2><a href="#auto-center">RobOS Auto Center: Complete Repair Shop Operations and Vehicle Owner Records</a></h2>
    <p class="blog-summary">Built an end-to-end automotive repair shop and vehicle owner suite covering Shop Admin, Front Desk intake, Mechanic Bench timing and parts ordering, Checkout guards, and job profit reporting.</p>
    <div class="blog-body">
      <p>Backed by public vehicle Knowledge Graph schemas, <strong>RobOS Auto Center</strong> (<code>packages/auto-center</code>) serves both individual vehicle owners (repair history backups, invoice OCR, bulk safety recall checks) and independent repair shops across four dedicated workspaces:</p>
      <ul>
        <li><strong>Shop Admin &amp; Catalog Import:</strong> Configure shop details, default hourly labor rates, team roles, supplier parts price lists, and validated bulk customer/vehicle CSV imports.</li>
        <li><strong>Front Desk Intake &amp; Estimates:</strong> Look up returning customers by phone, walk through structured multi-choice service intake questions, type-ahead vehicle makes/models/years/OBD-II trouble codes, and record customer estimate approvals.</li>
        <li><strong>Mechanic Bench &amp; Checkout Guards:</strong> Mechanics claim tickets, time labor with a built-in stopwatch, log diagnostic findings, and order/receive parts (blocking job completion while parts remain on order). Checkout enforces customer re-approval if charges exceed the estimate and prevents releasing keys with an unpaid balance.</li>
      </ul>
      <div class="blog-fig-grid">
        <figure class="blog-fig">
          <img src="{{ '/assets/auto-center/shots/02-front-desk-intake--prepare-the-estimate-and-record-approval-from-the-front-desk-5.jpg' | relative_url }}" alt="Front desk estimate preparation and customer approval in RobOS Auto Center" loading="lazy">
          <figcaption>Front Desk intake preparing an itemized repair estimate and recording customer approval.</figcaption>
        </figure>
        <figure class="blog-fig">
          <img src="{{ '/assets/auto-center/shots/03-mechanic-bench--time-the-job-with-a-stopwatch-5.jpg' | relative_url }}" alt="Mechanic bench job timing and parts status in RobOS Auto Center" loading="lazy">
          <figcaption>Mechanic Bench tracking labor time, diagnostic notes, and received parts.</figcaption>
        </figure>
      </div>
    </div>
    <div class="blog-links">
      <a href="{{ '/auto-center/' | relative_url }}">Read the 9-part Auto Center shop &amp; owner guide →</a>
      <span class="blog-commits">Commits: 71fd657c · d77642e2 · fbceb6db · d0a6e4d2 · 465a9fd4</span>
    </div>
  </article>

  <article class="blog-entry" id="starfall-command-rts">
    <div class="blog-meta">
      <time class="blog-date" datetime="2026-10-15">Oct 15, 2026</time>
      <span class="blog-tag">Starfall Command</span>
      <span class="blog-tag">RTS Engine</span>
      <span class="blog-tag">Games</span>
    </div>
    <h2><a href="#starfall-command-rts">Starfall Command: Deterministic 2.5D Real-Time Strategy Engine</a></h2>
    <p class="blog-summary">Created a SnowPlay and StarCraft II-inspired deterministic RTS engine featuring three asymmetric factions, a 2.5D angled perspective renderer, and an automated 1080p 4-act battle recorder.</p>
    <div class="blog-body">
      <p>To test how far KGraph-driven game architecture stretches into high-unit-count real-time simulation, we built <strong>Starfall Command</strong> (<code>games/robos-rts</code>), a deterministic real-time strategy game with a custom 2.5D angled 3D perspective renderer:</p>
      <ul>
        <li><strong>Three Asymmetric Factions:</strong> Command the <em>Meridian Guard</em> (human terran-style infantry, siege howitzer splash lines, and retractable silo gates), the <em>Gnarl Brood</em> (swarming bio-monsters), or the <em>Aurelian Concord</em> (high-tech phase-stepping walkers and cliff-striding Spire Walkers).</li>
        <li><strong>Classic RTS Economy &amp; Controls:</strong> Full crystal and aether tap harvesting, build-grid placement validation, production queues, control groups, idle-worker alerts, supply caps, and kiting micro-management.</li>
        <li><strong>Programmatic Capture &amp; 4-Act Demo:</strong> Exposed HTTP/IPC camera, selection, and screenshot control endpoints to drive a deterministic 4-act 1080p battle showcase.</li>
      </ul>
      <div class="blog-fig-grid">
        <figure class="blog-fig">
          <img src="{{ '/assets/games/rts/24-howitzer-splash-volley.jpg' | relative_url }}" alt="Meridian Guard howitzer line firing a splash volley in Starfall Command" loading="lazy">
          <figcaption>Emplaced Meridian Guard howitzers firing splash volleys across Starfall Canyon.</figcaption>
        </figure>
        <figure class="blog-fig">
          <img src="{{ '/assets/games/rts/33-three-way-battle.jpg' | relative_url }}" alt="Three-way battle between Meridian Guard, Gnarl Brood, and Aurelian Concord" loading="lazy">
          <figcaption>Three-faction clash between the Meridian Guard, Gnarl Brood, and Aurelian Concord.</figcaption>
        </figure>
      </div>
    </div>
    <div class="blog-links">
      <a href="{{ '/games/robos-rts/' | relative_url }}">Visit the Starfall Command page →</a>
      <a href="{{ '/games/robos-rts/docs/' | relative_url }}">Read the RTS engine docs →</a>
      <span class="blog-commits">Commits: f061446b · ac778e9c · ec1ec177 · 2c5f2eef · be7b70a5</span>
    </div>
  </article>

  <article class="blog-entry" id="skill-commons-and-site-v2">
    <div class="blog-meta">
      <time class="blog-date" datetime="2026-10-16">Oct 12 – Oct 19, 2026</time>
      <span class="blog-tag">Whitepaper</span>
      <span class="blog-tag">The Skill Commons</span>
      <span class="blog-tag">rowbose.com</span>
    </div>
    <h2><a href="#skill-commons-and-site-v2">The Skill Commons Whitepaper, rowbose.com v2, and Context-Engineering Internships</a></h2>
    <p class="blog-summary">Published "The Skill Commons" whitepaper on reducing AI data center strain via reusable WebAssembly base tasks, redesigned rowbose.com around an interactive 31-slide SDLC hero player, and launched the open-source contributor internship track.</p>
    <div class="blog-body">
      <p>We rewrote our long-term architectural thesis into <strong>The Skill Commons</strong> whitepaper and plain-English summary at <a href="{{ '/future/' | relative_url }}">rowbose.com/future</a>: instead of asking frontier data centers to regenerate solved routines from scratch for every app, software tasks are decomposed into content-addressed, verified WebAssembly (WASI 0.2 / WIT) leaf skills and snapped together locally by a small model on your own machine.</p>
      <ul>
        <li><strong>rowbose.com v2 &amp; 31-Slide Live Hero:</strong> Promoted the new flat, light-by-default front site to <code>rowbose.com</code> (archiving classic docs under <code>/v1/</code>), featuring a 31-slide interactive player and full video recording that traces a real task from planning to merged PR.</li>
        <li><strong>Small-Business Playbook &amp; Contributor Internships:</strong> Added the "Make Money with RobOS" small-business section on the homepage, replaced placeholder app letters with native RobOS SVGs across <code>/apps/</code>, and framed open-source contributions at <a href="{{ '/contribute/' | relative_url }}">/contribute/</a> as a public context-engineering internship.</li>
      </ul>
      <figure class="blog-fig">
        <img src="{{ '/assets/future/ai/commons-map.jpg' | relative_url }}" alt="The Skill Commons schematic showing decomposition into reusable base tasks and local assembly" loading="lazy">
        <figcaption>The Skill Commons: decompose jobs into verified base tasks once, and assemble them locally.</figcaption>
      </figure>
    </div>
    <div class="blog-links">
      <a href="{{ '/future/' | relative_url }}">Read The Skill Commons summary →</a>
      <a href="{{ '/future/whitepaper/' | relative_url }}">Read the full whitepaper →</a>
      <a href="{{ '/contribute/' | relative_url }}">Explore the Contribute page →</a>
      <span class="blog-commits">Commits: 749b1053 · b992571d · a338228e · 714f8991 · d59af754</span>
    </div>
  </article>

  <article class="blog-entry" id="pr-review-theater-and-dev-central">
    <div class="blog-meta">
      <time class="blog-date" datetime="2026-10-12">Sep 30 – Oct 12, 2026</time>
      <span class="blog-tag">PR Review Theater</span>
      <span class="blog-tag">Dev Central v2</span>
      <span class="blog-tag">CI &amp; Governance</span>
    </div>
    <h2><a href="#pr-review-theater-and-dev-central">Local-First PR Review Theater, Live Demo Steering, and Autonomous CI Recovery</a></h2>
    <p class="blog-summary">Turned code review into a two-stage local and peer workflow with syntax-aware diffs, steerable agent walkthrough checkpoints, evidence-backed PR descriptions, and live Buildkite/GitHub CI failure recovery.</p>
    <div class="blog-body">
      <p>Agents shouldn't open noisy pull requests before a developer has inspected the work. We restructured the delivery workflow across <strong>Task Implementer</strong>, <strong>Dev Central v2</strong>, and <strong>PR Review Theater</strong> (<code>packages/pr-review</code>) so agents push a feature branch first and hand off to a local review stage:</p>
      <ul>
        <li><strong>Changes, Evidence &amp; Steerable Walkthroughs:</strong> Developers inspect syntax-highlighted diffs, before/after screenshot evidence, and editable multi-checkpoint walkthroughs—and can send live steering messages in the side-pane chat to refine code, evidence, or demo steps in place.</li>
        <li><strong>Factual PR Descriptions &amp; Team Handoff:</strong> When ready, developers create a draft PR with Markdown descriptions grounded in real walkthrough screenshots, monitor live GitHub Actions and Buildkite logs, trigger guided local CI repair on failed checks, and undraft with prefilled reviewers and Slack mentions.</li>
        <li><strong>Desktop Polish:</strong> Shipped the <strong>RobOS GNOME Desktop App Installer</strong> (<code>packages/gnome-desktop-installer</code>) with background worker-thread shortcut repair, plus a built-in skill browser in <code>&lt;robos-ai-textarea&gt;</code>.</li>
      </ul>
      <div class="blog-fig-grid">
        <figure class="blog-fig">
          <img src="{{ '/assets/shots/review-evidence.jpg' | relative_url }}" alt="Before and after visual evidence inside PR Review Theater" loading="lazy">
          <figcaption>PR Review Theater comparing before-and-after visual evidence alongside the agent chat pane.</figcaption>
        </figure>
        <figure class="blog-fig">
          <img src="{{ '/assets/hero/slides/24-ready-dialog.jpg' | relative_url }}" alt="Promoting a passing draft PR to Ready for Review with team notifications" loading="lazy">
          <figcaption>Promoting a verified draft PR after CI passes, with reviewer selection and team notification.</figcaption>
        </figure>
      </div>
    </div>
    <div class="blog-links">
      <a href="{{ '/v1/pr-review-theater.html' | relative_url }}">Read the PR Review Theater documentation →</a>
      <span class="blog-commits">Commits: 334dce83 · 2132b1b9 · cea112ea · 1e338aca · aedb5135</span>
    </div>
  </article>

  <article class="blog-entry" id="realm-of-heroes-crpg">
    <div class="blog-meta">
      <time class="blog-date" datetime="2026-10-02">Sep 22 – Oct 2, 2026</time>
      <span class="blog-tag">Realm of Heroes cRPG</span>
      <span class="blog-tag">Godot 4</span>
      <span class="blog-tag">cRPG Editor</span>
    </div>
    <h2><a href="#realm-of-heroes-crpg">Realm of Heroes cRPG Engine and the Unified RobOS cRPG Editor</a></h2>
    <p class="blog-summary">Built an Infinity Engine-inspired tactical cRPG in Godot 4 with 3D miniature combat, socketed equipment, a 22-spell VFX suite, and a unified Electron authoring studio with topological quest trees.</p>
    <div class="blog-body">
      <p>We built <strong>Realm of Heroes cRPG</strong> (<code>games/crpg-realm</code>) and consolidated all campaign authoring tools into the unified <strong>RobOS cRPG Editor</strong> (<code>packages/crpg-editor</code>):</p>
      <ul>
        <li><strong>Unified cRPG Editor &amp; Topological Quest DAGs:</strong> Features Campaign Studio, a topological Quest Scenario Tree DAG editor with choice-anchored curves and transition triggers, a Story Flow page turner, Spells/Abilities/Item Studios, a first-class Enemies Bestiary, graphical drag-and-drop inventory bags with encumbrance meters, and exported Player Cartridges.</li>
        <li><strong>3D Miniatures, Equipment Sockets &amp; 22-Spell BDD Suite:</strong> Upgraded characters and monsters to 3D models with dynamic weapon, armor, and shield socket attachment and real-time AC recalculation. Added 3D particle VFX and BDD verification for 22 spells including 8d6 Fireball, Magic Missile, Blizzard (with ground ice and prone slipping), Stinking Cloud, and Invisibility.</li>
        <li><strong>Elevation, Pathfinding &amp; Playable Campaigns:</strong> Implemented AStarGrid2D pathfinding with string-pulling funnel smoothing, multi-tier house porch and stairs elevation transitions, Infinity Engine social aggro and trap detection, and playable <em>Dragon Warrior 1</em> and <em>Rescue the Princess</em> campaigns.</li>
      </ul>
      <figure class="blog-fig">
        <img src="{{ '/assets/games/crpg-bg-poster.jpg' | relative_url }}" alt="Realm of Heroes cRPG tactical party combat in Godot 4" loading="lazy">
        <figcaption>Realm of Heroes cRPG in Godot 4 with tactical party formations, 3D miniatures, and spell VFX.</figcaption>
      </figure>
    </div>
    <div class="blog-links">
      <a href="{{ '/games/crpg/' | relative_url }}">Visit the Realm of Heroes cRPG page →</a>
      <a href="{{ '/games/crpg/docs/' | relative_url }}">Read the cRPG Creator Guide →</a>
      <span class="blog-commits">Commits: fe1aeac1 · 9c1f4e3a · 5c683003 · 4c0e52ea · 8d6b7a58</span>
    </div>
  </article>

  <article class="blog-entry" id="robos-voice-and-parse-portal">
    <div class="blog-meta">
      <time class="blog-date" datetime="2026-09-30">Sep 22 – Sep 30, 2026</time>
      <span class="blog-tag">RobOS Voice</span>
      <span class="blog-tag">KGraph Parse Portal</span>
      <span class="blog-tag">E-Learning</span>
    </div>
    <h2><a href="#robos-voice-and-parse-portal">RobOS Voice Assistant, KGraph Parse Portal with Luxir Search, and Role-Based Training</a></h2>
    <p class="blog-summary">Delivered a bi-directional neural voice assistant wired to all RobOS skills, a high-throughput KGraph Parse Portal fronting the Luxir C++ search engine and Tika 4.0, and interactive training tracks.</p>
    <div class="blog-body">
      <p>To make the desktop environment and Knowledge Graph accessible by voice and capable of indexing massive enterprise document stores, we shipped three major subsystems in late September:</p>
      <ul>
        <li><strong>RobOS Voice (<code>packages/voice-prompt</code>):</strong> Bi-directional voice assistant combining natural Kokoro-82M / Edge-TTS neural speech with offline Whisper STT, Rhasspy/whisper_streaming adaptive energy VAD, suffix-prefix utterance stitching, PipeWire live waveform preview, and real-time voice execution of RobOS skills.</li>
        <li><strong>KGraph Parse Portal &amp; Luxir C++ Search (<code>packages/kgraph-parse-portal</code>):</strong> Built the ingestion gateway fronting Apache Tika 4.0 gRPC connectors, contextual MIME disambiguation, and the built-in Luxir C++ search index (alongside Solr, Elasticsearch, and OpenSearch schemas).</li>
        <li><strong>The Gig Bandit (<code>getemgigs.com</code>) &amp; E-Learning Tracks:</strong> Shipped the production Next.js live-music discovery app and <code>nextjs-vercel-web</code> App Wizard template, plus interactive <strong>RobOS eLearning</strong> courses and role-based training tracks for Non-Developers, Systems Architects, Agent Harness Engineers, and Senior Reviewers.</li>
      </ul>
      <div class="blog-fig-grid">
        <figure class="blog-fig">
          <img src="{{ '/v1/assets/images/kgraph-parse-portal-architecture.jpg' | relative_url }}" alt="KGraph Parse Portal and Luxir search index architecture" loading="lazy">
          <figcaption>KGraph Parse Portal ingestion pipeline with Apache Tika 4.0 and Luxir search indexing.</figcaption>
        </figure>
        <figure class="blog-fig">
          <img src="{{ '/v1/assets/images/elearning-creation-ux-architecture.jpg' | relative_url }}" alt="RobOS eLearning curriculum and certificate architecture" loading="lazy">
          <figcaption>Interactive eLearning player, quiz engine, and Knowledge Graph certificate issuance.</figcaption>
        </figure>
      </div>
    </div>
    <div class="blog-links">
      <a href="{{ '/v1/voice-prompt.html' | relative_url }}">RobOS Voice docs →</a>
      <a href="{{ '/v1/kgraph-parse-portal.html' | relative_url }}">KGraph Parse Portal docs →</a>
      <a href="{{ '/v1/training.html' | relative_url }}">Role-Based Training tracks →</a>
      <span class="blog-commits">Commits: a2402d57 · c5848ef8 · 1ab57468 · 42fe48e5 · f4e37446</span>
    </div>
  </article>

  <article class="blog-entry" id="dual-state-kgraph-and-sdlc">
    <div class="blog-meta">
      <time class="blog-date" datetime="2026-09-18">Aug 25 – Sep 18, 2026</time>
      <span class="blog-tag">Knowledge Graph</span>
      <span class="blog-tag">SDLC Platform</span>
      <span class="blog-tag">Foundation release</span>
    </div>
    <h2><a href="#dual-state-kgraph-and-sdlc">Modular Dual-State Knowledge Graph, 16-Step SDLC Tool Suite, and the RobOS foundation release</a></h2>
    <p class="blog-summary">Laid the foundation of RobOS: a multi-package JSON-LD Knowledge Graph validated by W3C SHACL shapes, a complete desktop SDLC suite from C4 topology modeling to Kind Kubernetes auto-deploy, and the foundation release.</p>
    <div class="blog-body">
      <p>The first month of this two-month sprint established the core thesis of RobOS—that the <strong>Knowledge Graph is the product</strong>—and delivered the <strong>foundation</strong> release across the desktop appliance VM and native app suite:</p>
      <ul>
        <li><strong>Modular Dual-State Knowledge Graph (<code>.robos/kgraphs/</code>):</strong> Replaced monolithic config files with namespaced JSON-LD packages validated by W3C SHACL shapes and aligned with Schema.org, backed by <strong>Knowledge Graph Explorer</strong> (with an embedded Swagger-UI OpenAPI console and reviewed workspace imports), <strong>Schema Studio</strong>, and the <code>kgraph-*</code> skills CLI for semantic blast-radius diffing between <code>main</code> and feature branches.</li>
        <li><strong>16-Step Verified SDLC &amp; Cloud-Init Onboarding:</strong> Automated first-boot QEMU/KVM provisioning with <code>robos-splash</code> and unified GitHub onboarding; verified the 16-step Acme Petshop lifecycle across <strong>Task Planner</strong>, <strong>System Topology Studio</strong> (C4 + OpenAPI 3.1 synthesis), <strong>Git Projects</strong>, <strong>Bruno REST API Client</strong>, and <strong>Kube Studio</strong> (with real local Kind Kubernetes clusters and zero-click KGraph auto-deployment).</li>
        <li><strong>IDE Debugging Bridges, UHP Agent Routing &amp; Prompt Security:</strong> Shipped the <strong>IntelliJ IDEA</strong> (port 63343 IPC) and <strong>VS Code</strong> breakpoint reproduction and PR review bridges, <strong>Agents Manager</strong> &amp; <strong>Agent Chat</strong> with UHP <code>HarnessRouter</code>, MCP OAuth, Caveman prompt compression, DSPy optimization, <strong>Remote Execution Studio</strong> (Bazel/Buck2/REAPI), and the zero-dependency <strong>Prompt Security Guard</strong>.</li>
      </ul>
      <div class="blog-fig-grid">
        <figure class="blog-fig">
          <img src="{{ '/v1/assets/images/dual-state-blast-radius.jpg' | relative_url }}" alt="Dual-State Knowledge Graph semantic blast radius diffing" loading="lazy">
          <figcaption>Dual-State Knowledge Graph comparing production main against a feature branch before merge.</figcaption>
        </figure>
        <figure class="blog-fig">
          <img src="{{ '/v1/assets/images/agent-tier-dispatch-algorithm.jpg' | relative_url }}" alt="Context-efficient agent tier routing and UHP harness dispatch" loading="lazy">
          <figcaption>Context-efficient routing across frontier and cheap/local models via the Unified Harness Protocol.</figcaption>
        </figure>
      </div>
    </div>
    <div class="blog-links">
      <a href="{{ '/v1/knowledge-graph.html' | relative_url }}">Knowledge Graph architecture →</a>
      <a href="{{ '/v1/walkthroughs.html' | relative_url }}">16-Step SDLC walkthroughs →</a>
      <a href="{{ '/download/' | relative_url }}">Download RobOS {{ site.data.release.tag }} →</a>
      <span class="blog-commits">Commits: 73cb6441 · 194e2c8a · a90ae3f7 · 6f0e1605 · 1143d01c</span>
    </div>
  </article>

</div>
