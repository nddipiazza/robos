---
title: App Directory
layout: default
parent: Use RobOS
nav_order: 2
permalink: /apps.html
---

# App Directory
{: .no_toc }

Every RobOS desktop app, each with its own page. They're built with Electron and plain JavaScript, and they all share the same knowledge graph.
{: .fs-6 .fw-300 }

<div class="rb-app-filter">
  <input type="search" id="rb-app-search" placeholder="Filter apps by name or what they do…" aria-label="Filter apps" autocomplete="off">
</div>

<nav class="rb-cat-pills" aria-label="App categories">
{%- for cat in site.data.app_categories -%}
  {%- assign n = site.apps | where: "category", cat.id | size -%}
  {%- if n > 0 %}
  <a href="#{{ cat.id }}">{{ cat.icon }} {{ cat.name }}</a>
  {%- endif -%}
{%- endfor %}
</nav>

{%- assign known_ids = site.data.app_categories | map: "id" -%}
{%- assign other_apps = "" | split: "" -%}
{%- for app in site.apps -%}
  {%- unless known_ids contains app.category -%}{%- assign other_apps = other_apps | push: app -%}{%- endunless -%}
{%- endfor -%}

{%- for cat in site.data.app_categories -%}
{%- assign apps = site.apps | where: "category", cat.id | sort_natural: "title" -%}
{%- if apps.size > 0 %}
<section class="rb-cat" id="{{ cat.id }}">
  <h2 class="rb-cat-title">{{ cat.icon }} {{ cat.name }}</h2>
  <div class="robos-apps-grid">
    {%- for app in apps %}
    {% include app-card.html app=app %}
    {%- endfor %}
  </div>
</section>
{%- endif -%}
{%- endfor -%}

{%- if other_apps.size > 0 %}
<section class="rb-cat" id="more-apps">
  <h2 class="rb-cat-title">✨ More apps</h2>
  <div class="robos-apps-grid">
    {%- assign other_apps = other_apps | sort_natural: "title" -%}
    {%- for app in other_apps %}
    {% include app-card.html app=app %}
    {%- endfor %}
  </div>
</section>
{%- endif %}

<p class="rb-app-none" id="rb-app-none" hidden>No apps match that filter.</p>

<script>
(function () {
  var input = document.getElementById('rb-app-search');
  if (!input) return;
  var cards = Array.prototype.slice.call(document.querySelectorAll('.rb-cat .robos-app-card'));
  var sections = Array.prototype.slice.call(document.querySelectorAll('.rb-cat'));
  var none = document.getElementById('rb-app-none');
  input.addEventListener('input', function () {
    var q = input.value.trim().toLowerCase();
    cards.forEach(function (card) {
      card.hidden = q !== '' && card.textContent.toLowerCase().indexOf(q) === -1;
    });
    var any = false;
    sections.forEach(function (s) {
      var visible = s.querySelectorAll('.robos-app-card:not([hidden])').length > 0;
      s.hidden = !visible;
      any = any || visible;
    });
    none.hidden = any;
  });
})();
</script>
