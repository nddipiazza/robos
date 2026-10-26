---
layout: default
title: RobOS on Your Smart TV — Developer Mode Sideloader & 10-Foot Portal
description: "Turn any LG webOS, Samsung Tizen, Google TV / Android TV, Fire TV, or Roku Smart TV into a first-class RobOS display: Developer Mode sideloading, the 10-Foot Big-Screen Portal (:19210), D-Pad & Gamepad navigation, and 4K 120Hz Moonlight/Sunshine streaming."
permalink: /tv/
extra_css: /assets/blog.css
og_image: /assets/tv/robos-tv-architecture.png
og_image_alt: "RobOS Smart TV Architecture — Developer Mode Sideloading, 10-Foot Portal, and 4K Game Streaming"
schema_type: TechArticle
keywords: "RobOS TV, Smart TV Developer Mode, LG webOS sideload IPK, ares-install, ares-extend-dev, Samsung Tizen sideload WGT, sdb install, Google TV ADB Leanback, Roku ECP, 10-foot UI, Moonlight Sunshine 4K game streaming"
---
<section class="blog-hero">
  <div class="wrap">
    <p class="eyebrow">RobOS Living Room &amp; Big-Screen Suite</p>
    <h1>RobOS on your Smart TV</h1>
    <p class="lead">You don't need to wait for commercial TV app stores to approve a full Linux desktop and game suite. <strong>RobOS Smart TV Studio</strong> (<code>packages/robos-tv</code>) pairs with your TV over your local network, generates native <strong>Developer Mode</strong> launcher packages for LG webOS, Samsung Tizen, Google TV / Android TV, and Roku OS, and serves a D-Pad &amp; Gamepad-native <strong>10-Foot Big-Screen Portal</strong> alongside 4K 120Hz Moonlight/Sunshine streaming.</p>
  </div>
  <nav class="blog-jump" aria-label="Jump to TV guide section">
    <a href="#architecture">How RobOS Works on a TV</a>
    <a href="#sideload-guides">Developer Mode By TV Brand</a>
    <a href="#ten-foot-portal">The 10-Foot Portal (:19210)</a>
    <a href="#apps-ecosystem">First-Class TV Apps in RobOS</a>
  </nav>
</section>

<div class="blog-feed">

  <article class="blog-entry" id="architecture">
    <div class="blog-meta">
      <time class="blog-date" datetime="2026-10-26">Oct 26, 2026</time>
      <span class="blog-tag">RobOS Smart TV Studio (<code>packages/robos-tv</code>)</span>
      <span class="blog-tag">10-Foot Portal (<code>:19210</code>)</span>
      <span class="blog-tag">LG webOS / Samsung Tizen / Android TV ADB / Roku</span>
      <span class="blog-tag">Moonlight &amp; Cast</span>
    </div>
    <h2><a href="#architecture">Why Sideload via TV Developer Mode Instead of the App Store?</a></h2>
    <p class="blog-summary">Smart TVs run locked-down ARM operating systems (LG webOS, Samsung Tizen, Android TV, Roku OS), whereas RobOS runs full desktop Electron applications, Godot 4 games, local AI models, and Linux kernel services. Instead of stripping RobOS down to fit a commercial TV store's restrictions, <strong>every major Smart TV ships with a built-in Developer Mode</strong> that lets you install your own home-screen launcher app pointing directly to your RobOS host over LAN.</p>

    <div class="blog-body">
      <figure class="blog-fig">
        <img src="{{ '/assets/tv/robos-tv-architecture.png' | relative_url }}" alt="Technical architecture diagram of RobOS Smart TV Studio, Developer Mode Sideloading, 10-Foot Portal, and 4K Game Streaming" loading="lazy">
        <figcaption>Architecture of <strong>RobOS Smart TV Studio</strong> (<code>packages/robos-tv</code>) and the shared <code>robos-lib/tv-engine.js</code> service: one click generates native Developer Mode packages that add a <strong>RobOS TV</strong> icon to your TV's native app bar.</figcaption>
      </figure>

      <pre class="mermaid">
flowchart LR
  subgraph HOST["RobOS Host / Appliance VM (LAN IP e.g. 192.168.1.100)"]
    STUDIO["RobOS Smart TV Studio<br/>packages/robos-tv (:19206)"]
    PORTAL["10-Foot Spatial Nav Portal<br/>http://192.168.1.100:19210"]
    BUILDER["Native Sideload Builder<br/>robos-lib/tv-engine.js"]
    CAST["Google Cast &amp; Kokoro TTS<br/>packages/home-speaker &amp; audio-player"]
    SUN["Sunshine 4K 120Hz Host<br/>H.265 / AV1 + Gamepad"]

    STUDIO --> PORTAL
    STUDIO --> BUILDER
    STUDIO --> CAST
    STUDIO --> SUN
  end

  subgraph LAN["Local Network Protocols (Zero Cloud)"]
    WEBOS["LG webOS Dev Mode<br/>ares-install (:9991) + ares-extend-dev (1000h)"]
    TIZEN["Samsung Tizen SDB<br/>tizen install RobOSTV.wgt (:26101)"]
    ADB["Google TV / Android TV / Fire TV<br/>ADB Leanback (:5555) + Cast (:8009)"]
    ROKU["Roku OS<br/>ECP (:8060) + SceneGraph ZIP"]
    MOON["Moonlight Stream<br/>4K 60/120fps Low-Latency"]

    BUILDER --> WEBOS
    BUILDER --> TIZEN
    BUILDER --> ADB
    BUILDER --> ROKU
    SUN --> MOON
  end

  subgraph TV["Living Room &amp; Office Wall Smart TVs"]
    LAUNCHER["Native 'RobOS TV' Home Row Icon<br/>Opens http://192.168.1.100:19210"]
    DPAD["TV Remote D-Pad + Bluetooth Gamepad<br/>Arrow Keys / OK / Back / Play-Pause"]
    APPS["8 Big-Screen Experiences<br/>Godot 4 Games · Virtual DJ Jukebox · Intercom · PR Theater · POS Board"]

    WEBOS --> LAUNCHER
    TIZEN --> LAUNCHER
    ADB --> LAUNCHER
    ROKU --> LAUNCHER
    MOON --> APPS
    LAUNCHER --> DPAD
    DPAD --> APPS
  end
      </pre>

      <h3 id="sideload-guides">Step-by-Step: Enable Developer Mode &amp; Add RobOS to Your TV</h3>
      <p>Open <strong>RobOS Smart TV Studio</strong> from the RobOS App Launcher (or click <strong>📺 Smart TV Studio</strong> inside <strong>RobOS Home Speaker</strong>), switch to the <strong>Developer Mode Sideloader</strong> tab, and select your TV brand:</p>

      <ol>
        <li>
          <strong>Google TV / Android TV / Amazon Fire TV (Sony, TCL, Hisense, NVIDIA Shield, Chromecast with Google TV):</strong>
          <ul>
            <li>On your TV, go to <strong>Settings → System → About</strong> and press <strong>OK/Select</strong> on <strong>Android TV OS Build</strong> 7 times until <em>"You are now a developer!"</em> appears.</li>
            <li>Go to <strong>Settings → System → Developer Options</strong> and enable <strong>Network Debugging</strong> (or Wireless ADB on port <code>5555</code>).</li>
            <li>In <strong>RobOS Smart TV Studio</strong>, select <strong>Google TV / Android TV</strong>, enter your TV IP, and click <strong>Generate TV Sideload Package</strong>. RobOS writes <code>AndroidManifest.xml</code> (with <code>android.intent.category.LEANBACK_LAUNCHER</code>), <code>assets/index.html</code>, and <code>sideload-android-tv.sh</code>, which connects via <code>adb connect &lt;TV-IP&gt;:5555</code>, installs the Leanback launcher, and opens the 10-Foot Portal on screen.</li>
          </ul>
        </li>
        <li>
          <strong>LG webOS Smart TVs (LG OLED C/G/B Series, QNED, UHD):</strong>
          <ul>
            <li>Open the <strong>LG Content Store</strong> on your TV, search for <strong>Developer Mode</strong>, and install the official LG Developer Mode app.</li>
            <li>Log in with a free LG Developer account, turn <strong>Dev Mode Status</strong> to <strong>ON</strong> (your TV will reboot), then open the app again and turn on <strong>Key Server</strong>.</li>
            <li>In <strong>RobOS Smart TV Studio</strong>, enter your TV's IP address and the 6-character <strong>Passphrase</strong> shown on the TV screen, then click <strong>Generate TV Sideload Package</strong>.</li>
            <li>RobOS generates <code>appinfo.json</code> (<code>com.robos.tv</code>), <code>index.html</code>, and <code>sideload-webos.sh</code> (<code>ares-package</code> + <code>ares-novacom --getkey</code> + <code>ares-install</code> + <code>ares-launch</code>).</li>
            <li><strong>Automatic 1,000-Hour Timer Renewal:</strong> LG resets Developer Mode if it isn't renewed before the 1,000-hour countdown expires. <strong>RobOS Smart TV Studio</strong> includes a one-click <strong>Renew LG webOS 1,000h Timer</strong> button (and background renewal via <code>ares-extend-dev</code>) so your sideloaded RobOS app stays installed permanently.</li>
          </ul>
        </li>
        <li>
          <strong>Samsung Tizen Smart TVs (Neo QLED, Samsung OLED, The Frame, Crystal UHD):</strong>
          <ul>
            <li>Open the <strong>Apps</strong> panel on your Samsung TV, press <code>1-2-3-4-5</code> on your remote, toggle <strong>Developer Mode</strong> to <strong>ON</strong>, and type your RobOS Host LAN IP address.</li>
            <li>Hold the TV power button for 5 seconds until the TV reboots.</li>
            <li>In <strong>RobOS Smart TV Studio</strong>, select <strong>Samsung Tizen Smart TV</strong> and click <strong>Generate TV Sideload Package</strong>. RobOS outputs <code>config.xml</code> (including <code>http://tizen.org/privilege/tv.inputdevice</code> for remote D-Pad keys), <code>index.html</code>, and <code>sideload-tizen.sh</code> (<code>sdb connect &lt;TV-IP&gt;:26101</code> + <code>tizen package -t wgt</code> + <code>tizen install -n RobOSTV.wgt</code>).</li>
          </ul>
        </li>
        <li>
          <strong>Roku OS TVs &amp; Streaming Players:</strong>
          <ul>
            <li>On your Roku remote, press <code>Home (3x), Up (2x), Right, Left, Right, Left, Right</code> to enable the Developer Application Installer.</li>
            <li>RobOS generates a complete Roku SceneGraph channel bundle (<code>manifest</code>, <code>source/Main.brs</code>, <code>components/MainScene.xml</code>, and <code>sideload-roku.sh</code>) and also controls any Roku on your LAN with zero configuration via the Roku External Control Protocol (<code>http://&lt;TV-IP&gt;:8060/keypress/*</code>).</li>
          </ul>
        </li>
        <li>
          <strong>Moonlight + Sunshine (4K 120Hz Full Desktop &amp; Godot 4 Game Streaming):</strong>
          <ul>
            <li>For heavy 3D/2D gaming with a controller on the couch, install <strong>Moonlight</strong> on your TV (available natively on Google TV, Fire TV, Apple TV, and via LG webOS Dev Mode / Homebrew) and pair it with the Sunshine host in RobOS.</li>
          </ul>
        </li>
      </ol>

      <div class="blog-log"># Launch RobOS Smart TV Studio or run the automated E2E verification suite
electron packages/robos-tv
node --test tests/e2e/robos-tv.test.cjs

# Generated LG webOS Developer Mode bundle (~/.config/robos/tv-packages/lg-webos/):
├── appinfo.json          # com.robos.tv (1920x1080 10-foot Web App manifest)
├── index.html            # Instant launcher for http://&lt;ROBOS-LAN-IP&gt;:19210
└── sideload-webos.sh     # ares-package + ares-novacom + ares-install + ares-extend-dev</div>

      <h3 id="ten-foot-portal">The 10-Foot Big-Screen Portal (<code>:19210</code>)</h3>
      <p>Desktop UIs with small 13px fonts and mouse menus are unreadable from a couch 10 feet away. When your TV opens the sideloaded <strong>RobOS TV</strong> app, it connects to the built-in <strong>RobOS 10-Foot Portal</strong> on port <code>19210</code>:</p>
      <ul>
        <li><strong>TV Remote D-Pad Spatial Navigation:</strong> Every tile responds to <code>ArrowUp</code>, <code>ArrowDown</code>, <code>ArrowLeft</code>, <code>ArrowRight</code>, <code>Enter/OK</code>, and <code>Back/Return</code> with high-contrast cyan focus rings and 28px+ typography.</li>
        <li><strong>HTML5 Gamepad API Integration:</strong> Plug in or pair an Xbox, DualSense, or 8BitDo controller—the portal automatically detects the controller and lets you launch directly into Godot 4 games.</li>
        <li><strong>Two-Way Virtual Remote:</strong> From your workstation or phone, use the <strong>TV D-Pad Remote &amp; Instant App Launch</strong> panel inside <strong>RobOS Smart TV Studio</strong> to switch what is playing on any TV in the house.</li>
      </ul>

      <h3 id="apps-ecosystem">First-Class TV Apps Across the RobOS Ecosystem</h3>
      <p>Adding <strong>RobOS Smart TV Studio</strong> ties together six existing RobOS suites on the big screen:</p>
      <ol>
        <li><strong>Godot 4 Living-Room Games (<a href="{{ '/games/' | relative_url }}"><code>/games/</code></a>):</strong> Play <a href="{{ '/games/crpg/' | relative_url }}">Realm of Heroes cRPG</a>, <a href="{{ '/games/quest-warrior-dragon/' | relative_url }}">Quest: Warrior Dragon</a> (2D JRPG playable with just a TV remote D-Pad!), <a href="{{ '/games/tabletop-rpg/' | relative_url }}">Tabletop RPG</a> for board-game nights, and <a href="{{ '/games/robos-rts/' | relative_url }}">Starfall Command RTS</a>.</li>
        <li><strong>RobOS Audio Player &amp; Virtual DJ (<a href="{{ '/v1/apps/audio-player/' | relative_url }}"><code>packages/audio-player</code></a>):</strong> Turn your TV into a 100,000-song living-room jukebox with full-screen synchronized lyrics, AI Playlists, and Kokoro TTS Virtual DJ intros streamed over Google Cast.</li>
        <li><strong>RobOS Home Speaker (<a href="{{ '/v1/apps/home-speaker/' | relative_url }}"><code>packages/home-speaker</code></a>):</strong> Includes a dedicated <strong>📺 Smart TV Studio</strong> button in the header and streams neural TTS announcements, walkie-talkie voice notes, and ambient rain/focus soundscapes to any Cast-enabled TV (such as <code>Basement TV</code>).</li>
        <li><strong>PR Review Theater (<a href="{{ '/v1/pr-review-theater.html' | relative_url }}"><code>packages/pr-review</code></a>):</strong> Watch autonomous 1080p narrated agent proof-of-work walkthrough videos and semantic KGraph blast-radius diffs from the couch or in a team conference room.</li>
        <li><strong>Point of Sale Digital Menu &amp; Order Prep Board (<a href="{{ '/point-of-sale/' | relative_url }}"><code>packages/point-of-sale</code></a>):</strong> Mount any affordable Smart TV on a café, bar, or retail wall and sideload <strong>RobOS TV</strong> to display live barista/kitchen prep queues and digital menu boards.</li>
      </ol>
    </div>

    <div class="blog-links">
      <a href="{{ '/v1/apps/robos-tv/' | relative_url }}">RobOS Smart TV Studio app page →</a>
      <a href="{{ '/v1/apps/home-speaker/' | relative_url }}">RobOS Home Speaker app page →</a>
      <a href="{{ '/v1/apps/audio-player/' | relative_url }}">RobOS Audio Player app page →</a>
      <a href="https://github.com/nddipiazza/robos/blob/main/packages/robos-tv">packages/robos-tv source →</a>
      <a href="https://github.com/nddipiazza/robos/blob/main/packages/robos-lib/tv-engine.js">TV Engine source →</a>
    </div>
  </article>

</div>
<script type="module">
  import mermaid from 'https://cdn.jsdelivr.net/npm/mermaid@10.9.0/dist/mermaid.esm.min.mjs';
  mermaid.initialize({ startOnLoad: true, theme: 'dark' });
</script>
