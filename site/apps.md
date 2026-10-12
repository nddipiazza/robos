---
layout: default
title: Apps
permalink: /apps/
description: Every RobOS desktop app, grouped by what it does.
---
<div class="page-h wrap">
  <h1>The app suite</h1>
  <p>{{ site.apps.size }} desktop apps that share one knowledge graph.</p>
  <input class="search" id="app-q" type="search" placeholder="Search apps…" aria-label="Search apps" autocomplete="off">
</div>
<div class="wrap" style="padding-bottom:80px">
{%- assign known_ids = site.data.app_categories | map: "id" -%}
{%- for cat in site.data.app_categories -%}
  {%- assign apps = site.apps | where: "category", cat.id | sort: "title" -%}
  {%- if apps.size > 0 %}
  <div class="app-group" id="{{ cat.id }}">
    <h2>{{ cat.icon }} {{ cat.name }}</h2>
    <div class="app-grid">
    {%- for app in apps %}
      <a class="card app-card" href="{{ "/v1/apps/" | append: app.slug | append: "/" | relative_url }}" data-s="{{ app.title | append: ' ' | append: app.summary | downcase | escape }}">
        {%- if app.icon -%}<img src="{{ '/v1/assets/images/icons/' | append: app.icon | relative_url }}" alt="" loading="lazy">{%- else -%}<span class="ph">{{ app.title | slice: 0 }}</span>{%- endif -%}
        <div><h3>{{ app.title }}</h3><p>{{ app.summary }}</p></div>
      </a>
    {%- endfor %}
    </div>
  </div>
  {%- endif -%}
{%- endfor -%}
{%- assign shown = 0 -%}
{%- assign others = "" | split: "" -%}
{%- for app in site.apps -%}{%- unless known_ids contains app.category or app.category == "games" -%}{%- assign others = others | push: app -%}{%- endunless -%}{%- endfor -%}
{%- if others.size > 0 %}
  <div class="app-group" id="more">
    <h2>More apps</h2>
    <div class="app-grid">
    {%- for app in others %}
      <a class="card app-card" href="{{ "/v1/apps/" | append: app.slug | append: "/" | relative_url }}" data-s="{{ app.title | append: ' ' | append: app.summary | downcase | escape }}">
        {%- if app.icon -%}<img src="{{ '/v1/assets/images/icons/' | append: app.icon | relative_url }}" alt="" loading="lazy">{%- else -%}<span class="ph">{{ app.title | slice: 0 }}</span>{%- endif -%}
        <div><h3>{{ app.title }}</h3><p>{{ app.summary }}</p></div>
      </a>
    {%- endfor %}
    </div>
  </div>
{%- endif %}
  <div class="app-group games-link">
    <a class="card" href="{{ '/games/' | relative_url }}" style="display:flex;gap:18px;align-items:center;justify-content:space-between;padding:28px">
      <div><h2 style="margin:0 0 6px">🎮 RobOS Games</h2><p style="margin:0">Realm of Heroes CRPG and the Tabletop RPG, plus their editors and docs.</p></div>
      <span class="go">Explore games →</span>
    </a>
  </div>
</div>
