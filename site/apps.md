---
layout: default
title: Apps
permalink: /apps/
description: Every RobOS app, library, CLI, service and MCP server, grouped by what it does.
og_image: /assets/og.png
og_image_width: 1200
og_image_height: 630
og_image_alt: "RobOS App Directory — Desktop applications, domain sandboxes, game studios and MCP servers"
schema_type: CollectionPage
keywords: "RobOS apps, app directory, desktop applications, Point of Sale, Auto Center, Household, Audio Player, Dev Central, Task Planner, Agent Code Review, Knowledge Graph Explorer, MCP servers"
---
<div class="page-h wrap">
  <p class="eyebrow">App Directory</p>
  <h1>The app suite</h1>
  <p>Apps, libraries, CLIs and services that share one knowledge graph.</p>
  <input class="search" id="app-q" type="search" placeholder="Search apps by name, package or what they do" aria-label="Search apps" autocomplete="off">
  <nav class="app-pills" aria-label="App categories">
  {%- for cat in site.data.app_categories -%}
    {%- assign n = site.apps | where: "category", cat.id | size -%}
    {%- if n > 0 %}
    <a href="#{{ cat.id }}">{{ cat.name }}</a>
    {%- endif -%}
  {%- endfor %}
    <a href="#reference-guides">Reference guides</a>
  </nav>
</div>

<div class="wrap" style="padding-bottom:80px">
  <div class="app-group app-featured" id="walkthroughs">
    <div class="app-group-head">
      <h2>Featured domain walkthroughs</h2>
      <span class="muted small">End-to-end applications built on the RobOS KGraph, verified by automated browser &amp; gameplay suites</span>
    </div>
    <div class="grid2" style="display:grid;gap:14px">
      <a class="card app-card" href="{{ '/point-of-sale/' | relative_url }}" data-s="robos point of sale point-of-sale cash register retail cafe bar self-checkout kiosk barcode qr webcam scanner inventory open checkout api">
        <img src="{{ '/assets/images/icons/point-of-sale.svg' | relative_url }}" width="40" height="40" alt="" loading="lazy">
        <div>
          <h3>RobOS Point of Sale</h3>
          <code class="app-pkg">Walkthrough · /point-of-sale/</code>
          <p>Touchscreen cash register for retail stores, cafés and bars: self-checkout kiosk, barcode gun &amp; webcam QR scanning, cash drawer Z-reports and an open checkout API.</p>
        </div>
      </a>
      <a class="card app-card" href="{{ '/auto-center/' | relative_url }}" data-s="robos auto center auto-center vehicle owner maintenance invoice ocr nhtsa recall remedies repair shop floor profit reports">
        <img src="{{ '/assets/images/icons/auto-center.svg' | relative_url }}" width="40" height="40" alt="" loading="lazy">
        <div>
          <h3>RobOS Auto Center</h3>
          <code class="app-pkg">Walkthrough · /auto-center/</code>
          <p>Owner vehicle care and invoice scans, private Git-backed repair shop workflows, shop-floor &amp; per-job profit reports, and source-backed NHTSA recall remedies.</p>
        </div>
      </a>
      <a class="card app-card" href="{{ '/family-finances/' | relative_url }}" data-s="robos household family finances checking savings credit card loan statement reconciliation spending categories split transactions w-2 1099 pdf tax estimate opentaxsolver tenforty">
        <img src="{{ '/assets/images/icons/household.svg' | relative_url }}" width="40" height="40" alt="" loading="lazy">
        <div>
          <h3>RobOS Household</h3>
          <code class="app-pkg">Walkthrough · /family-finances/</code>
          <p>A synthetic family's financial year from January statements and everyday spending splits to February W-2/1099 PDF field review and local federal tax estimates.</p>
        </div>
      </a>
      <a class="card app-card" href="{{ '/games/' | relative_url }}" data-s="robos games realm of heroes crpg tabletop rpg heroquest starfall command rts godot 4">
        <img src="{{ '/assets/images/icons/robos-tabletop.svg' | relative_url }}" width="40" height="40" alt="" loading="lazy">
        <div>
          <h3>RobOS Games</h3>
          <code class="app-pkg">Showcase · /games/</code>
          <p>Realm of Heroes party cRPG, the HeroQuest-inspired Tabletop RPG, and Starfall Command RTS — modeled in the KGraph and tested on camera.</p>
        </div>
      </a>
      <a class="card app-card" href="{{ '/security/#zero-leak-vpn-app-sandbox' | relative_url }}" data-s="robos vpn sandbox vpn servers openvpn ipvanish network namespace ip netns iptables kill switch zero leak firefox transmission">
        <img src="{{ '/assets/images/icons/vpn-sandbox.svg' | relative_url }}" width="40" height="40" alt="" loading="lazy">
        <div>
          <h3>RobOS VPN Sandbox &amp; VPN Servers</h3>
          <code class="app-pkg">Security Proof · /security/</code>
          <p>Launch any app inside an isolated Linux network namespace (<code>ip netns</code>) routed through OpenVPN (3,598 IPVanish profiles built in) with a live E2E-proven 3-barrier kernel kill-switch.</p>
        </div>
      </a>
      <a class="card app-card" href="{{ '/tv/' | relative_url }}" data-s="robos smart tv studio robos-tv developer mode sideload lg webos ipk ares-install samsung tizen wgt sdb google android tv adb leanback roku 10-foot portal moonlight sunshine">
        <img src="{{ '/assets/images/icons/robos-tv.svg' | relative_url }}" width="40" height="40" alt="" loading="lazy">
        <div>
          <h3>RobOS Smart TV Studio</h3>
          <code class="app-pkg">Big-Screen Guide · /tv/</code>
          <p>Sideload a native RobOS TV app via Developer Mode (LG webOS, Samsung Tizen, Google TV/ADB, Roku), navigate the 10-Foot Portal (<code>:19210</code>) with your TV remote D-Pad, and stream 4K 120Hz games.</p>
        </div>
      </a>
      <a class="card app-card" href="{{ '/movie-player/' | relative_url }}" data-s="robos movie player video player cinema stage tv shows seasons episodes roku smart tv cast subtitles srt vtt ai watchlist virtual cinema host sftp cloud">
        <img src="{{ '/assets/images/icons/movie-player.svg' | relative_url }}" width="40" height="40" alt="" loading="lazy">
        <div>
          <h3>RobOS Movie &amp; Video Player</h3>
          <code class="app-pkg">Home Theater Guide · /movie-player/ · /video-player/</code>
          <p>100,000-film &amp; TV series home theater with TMDB/TVmaze posters, Show &amp; Season Navigator, synced <code>.srt</code>/<code>.vtt</code> subtitles, AI Watchlists, Virtual Cinema Host, SFTP/Cloud HTTP 206 streaming, and a 3-row visual image-card Roku app.</p>
        </div>
      </a>
      <a class="card app-card" href="{{ '/p2p/' | relative_url }}" data-s="robos app mesh p2p zero trust mtls openziti tailscale headscale netbird wireguard cross machine ipc bridge movie streaming">
        <img src="{{ '/assets/images/icons/app-mesh.svg' | relative_url }}" width="40" height="40" alt="" loading="lazy">
        <div>
          <h3>RobOS App Mesh (Zero-Trust P2P)</h3>
          <code class="app-pkg">P2P &amp; Streaming Guide · /p2p/</code>
          <p>Provider-agnostic Zero-Trust App &amp; IPC Port Mesh (built-in mTLS 1.3, OpenZiti, Tailscale, NetBird, WireGuard) to bridge RobOS app ports and stream 1080p/4K movies across PCs.</p>
        </div>
      </a>
    </div>
  </div>

{%- assign known_ids = site.data.app_categories | map: "id" -%}
{%- for cat in site.data.app_categories -%}
  {%- assign apps = site.apps | where: "category", cat.id | sort_natural: "title" -%}
  {%- if apps.size > 0 %}
  <div class="app-group" id="{{ cat.id }}">
    <h2>{{ cat.name }}</h2>
    <div class="app-grid">
    {%- for app in apps %}
      <a class="card app-card" href="{{ '/' | append: app.package | append: '/' | relative_url }}" data-s="{{ app.title | append: ' ' | append: app.package | append: ' ' | append: cat.name | append: ' ' | append: app.summary | downcase | escape }}">
        {%- if app.icon -%}<img src="{{ '/assets/images/icons/' | append: app.icon | relative_url }}" width="40" height="40" alt="" loading="lazy">{%- else -%}<span class="ph">{{ app.title | slice: 0 }}</span>{%- endif -%}
        <div>
          <h3>{{ app.title }}</h3>
          <code class="app-pkg">{{ app.package }}</code>
          <p>{{ app.summary | escape }}</p>
        </div>
      </a>
    {%- endfor %}
    </div>
  </div>
  {%- endif -%}
{%- endfor -%}
{%- assign others = "" | split: "" -%}
{%- for app in site.apps -%}{%- unless known_ids contains app.category -%}{%- assign others = others | push: app -%}{%- endunless -%}{%- endfor -%}
{%- if others.size > 0 %}
  <div class="app-group" id="more">
    <h2>More apps</h2>
    <div class="app-grid">
    {%- assign others = others | sort_natural: "title" -%}
    {%- for app in others %}
      <a class="card app-card" href="{{ '/' | append: app.package | append: '/' | relative_url }}" data-s="{{ app.title | append: ' ' | append: app.package | append: ' ' | append: app.summary | downcase | escape }}">
        {%- if app.icon -%}<img src="{{ '/assets/images/icons/' | append: app.icon | relative_url }}" width="40" height="40" alt="" loading="lazy">{%- else -%}<span class="ph">{{ app.title | slice: 0 }}</span>{%- endif -%}
        <div>
          <h3>{{ app.title }}</h3>
          <code class="app-pkg">{{ app.package }}</code>
          <p>{{ app.summary | escape }}</p>
        </div>
      </a>
    {%- endfor %}
    </div>
  </div>
{%- endif %}
  <div class="app-group" id="reference-guides">
    <div class="app-group-head">
      <h2>Reference guides &amp; architecture</h2>
      <span class="muted small">Platform handbooks, KGraph ontologies, MCP tool catalogs, and package specifications</span>
    </div>
    <div class="app-grid">
    {%- assign root_guides = site.guides | sort_natural: "title" -%}
    {%- for g in root_guides -%}
      {%- if g.parent == nil and g.sitemap != false -%}
      <a class="card app-card" href="{{ g.url | relative_url }}" data-s="{{ g.title | append: ' ' | append: g.description | downcase | escape }}">
        <span class="ph">{{ g.title | slice: 0 }}</span>
        <div>
          <h3>{{ g.title }}</h3>
          <code class="app-pkg">{{ g.url }}</code>
          <p>{{ g.description | escape }}</p>
        </div>
      </a>
      {%- endif -%}
    {%- endfor -%}
      <a class="card app-card" href="{{ '/mcp-servers/' | relative_url }}" data-s="mcp servers model context protocol tools kgraph voice git ide">
        <span class="ph">M</span>
        <div>
          <h3>MCP Servers Reference</h3>
          <code class="app-pkg">/mcp-servers/</code>
          <p>Every Model Context Protocol server shipped in RobOS, its tool schemas, ports, and KGraph permissions.</p>
        </div>
      </a>
      <a class="card app-card" href="{{ '/system-documentation/' | relative_url }}" data-s="system documentation living architecture hub kgraph shacl">
        <span class="ph">S</span>
        <div>
          <h3>Living System Documentation</h3>
          <code class="app-pkg">/system-documentation/</code>
          <p>Interactive system documentation and W3C SHACL-verified architectural artifacts exported from the KGraph.</p>
        </div>
      </a>
    {%- assign ref_apps = site.apps | sort_natural: "title" -%}
    {%- for app in ref_apps -%}
      {%- assign root_path = '/' | append: app.package | append: '/' -%}
      {%- if app.url != root_path -%}
      <a class="card app-card" href="{{ app.url | relative_url }}" data-s="{{ app.title | append: ' reference ' | append: app.package | append: ' ' | append: app.summary | downcase | escape }}">
        {%- if app.icon -%}<img src="{{ '/assets/images/icons/' | append: app.icon | relative_url }}" width="40" height="40" alt="" loading="lazy">{%- else -%}<span class="ph">{{ app.title | slice: 0 }}</span>{%- endif -%}
        <div>
          <h3>{{ app.title }} Reference</h3>
          <code class="app-pkg">{{ app.url }}</code>
          <p>{{ app.summary | escape }}</p>
        </div>
      </a>
      {%- endif -%}
    {%- endfor -%}
    </div>
  </div>
  <p class="muted" id="app-none" hidden style="text-align:center;margin-top:48px">No apps match that search.</p>
</div>
