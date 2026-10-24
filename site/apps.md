---
layout: default
title: Apps
permalink: /apps/
description: Every RobOS desktop app, domain sandbox, game studio and MCP server, grouped by what it does.
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
  <p>Desktop applications, domain sandboxes, game studios and MCP servers that share one knowledge graph.</p>
  <input class="search" id="app-q" type="search" placeholder="Search apps by name, package or what they do" aria-label="Search apps" autocomplete="off">
  <nav class="app-pills" aria-label="App categories">
  {%- for cat in site.data.app_categories -%}
    {%- assign n = site.apps | where: "category", cat.id | size -%}
    {%- if n > 0 %}
    <a href="#{{ cat.id }}">{{ cat.name }}</a>
    {%- endif -%}
  {%- endfor %}
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
        <img src="{{ '/v1/assets/images/icons/point-of-sale.svg' | relative_url }}" width="40" height="40" alt="" loading="lazy">
        <div>
          <h3>RobOS Point of Sale</h3>
          <code class="app-pkg">Walkthrough · /point-of-sale/</code>
          <p>Touchscreen cash register for retail stores, cafés and bars: self-checkout kiosk, barcode gun &amp; webcam QR scanning, cash drawer Z-reports and an open checkout API.</p>
        </div>
      </a>
      <a class="card app-card" href="{{ '/auto-center/' | relative_url }}" data-s="robos auto center auto-center vehicle owner maintenance invoice ocr nhtsa recall remedies repair shop floor profit reports">
        <img src="{{ '/v1/assets/images/icons/auto-center.svg' | relative_url }}" width="40" height="40" alt="" loading="lazy">
        <div>
          <h3>RobOS Auto Center</h3>
          <code class="app-pkg">Walkthrough · /auto-center/</code>
          <p>Owner vehicle care and invoice scans, private Git-backed repair shop workflows, shop-floor &amp; per-job profit reports, and source-backed NHTSA recall remedies.</p>
        </div>
      </a>
      <a class="card app-card" href="{{ '/family-finances/' | relative_url }}" data-s="robos household family finances checking savings credit card loan statement reconciliation spending categories split transactions w-2 1099 pdf tax estimate opentaxsolver tenforty">
        <img src="{{ '/v1/assets/images/icons/household.svg' | relative_url }}" width="40" height="40" alt="" loading="lazy">
        <div>
          <h3>RobOS Household</h3>
          <code class="app-pkg">Walkthrough · /family-finances/</code>
          <p>A synthetic family's financial year from January statements and everyday spending splits to February W-2/1099 PDF field review and local federal tax estimates.</p>
        </div>
      </a>
      <a class="card app-card" href="{{ '/games/' | relative_url }}" data-s="robos games realm of heroes crpg tabletop rpg heroquest starfall command rts godot 4">
        <img src="{{ '/v1/assets/images/icons/robos-tabletop.svg' | relative_url }}" width="40" height="40" alt="" loading="lazy">
        <div>
          <h3>RobOS Games</h3>
          <code class="app-pkg">Showcase · /games/</code>
          <p>Realm of Heroes party cRPG, the HeroQuest-inspired Tabletop RPG, and Starfall Command RTS — modeled in the KGraph and tested on camera.</p>
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
      <a class="card app-card" href="{{ '/v1/apps/' | append: app.slug | append: '/' | relative_url }}" data-s="{{ app.title | append: ' ' | append: app.package | append: ' ' | append: cat.name | append: ' ' | append: app.summary | downcase | escape }}">
        {%- if app.icon -%}<img src="{{ '/v1/assets/images/icons/' | append: app.icon | relative_url }}" width="40" height="40" alt="" loading="lazy">{%- else -%}<span class="ph">{{ app.title | slice: 0 }}</span>{%- endif -%}
        <div>
          <h3>{{ app.title }}</h3>
          <code class="app-pkg">{{ app.package }}</code>
          <p>{{ app.summary }}</p>
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
      <a class="card app-card" href="{{ '/v1/apps/' | append: app.slug | append: '/' | relative_url }}" data-s="{{ app.title | append: ' ' | append: app.package | append: ' ' | append: app.summary | downcase | escape }}">
        {%- if app.icon -%}<img src="{{ '/v1/assets/images/icons/' | append: app.icon | relative_url }}" width="40" height="40" alt="" loading="lazy">{%- else -%}<span class="ph">{{ app.title | slice: 0 }}</span>{%- endif -%}
        <div>
          <h3>{{ app.title }}</h3>
          <code class="app-pkg">{{ app.package }}</code>
          <p>{{ app.summary }}</p>
        </div>
      </a>
    {%- endfor %}
    </div>
  </div>
{%- endif %}
  <p class="muted" id="app-none" hidden style="text-align:center;margin-top:48px">No apps match that search.</p>
</div>
