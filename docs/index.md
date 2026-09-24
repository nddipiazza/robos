---
title: Home
layout: home
nav_order: 1
permalink: /
---

<div class="rb-hero">
  <h1>RobOS</h1>
  <p class="rb-tagline">AI agents write the code. RobOS makes sure you can trust it.</p>
  <p class="rb-sub">A desktop suite of developer apps, a knowledge graph of your whole system, and review tools that show you exactly what an agent changed and prove it works.</p>
  <div class="rb-hero-actions">
    <a href="{{ site.baseurl }}{% link getting-started.md %}" class="btn btn-primary fs-5">🚀 Get Started</a>
    <a href="https://github.com/nddipiazza/robos" class="btn fs-5" target="_blank" rel="noopener">⭐ GitHub</a>
    <a href="https://discord.gg/6PjxzkHujE" class="btn fs-5" target="_blank" rel="noopener">💬 Discord</a>
  </div>
</div>

<div class="rb-demo">
  <video autoplay muted loop playsinline controls preload="metadata" poster="{{ '/assets/images/robos-proof-of-work-demo-poster.jpg' | relative_url }}" aria-label="RobOS walkthrough: from idea to reviewed, tested, deployed code">
    <source src="{{ '/assets/videos/robos-proof-of-work-demo-loop.mp4' | relative_url }}" type="video/mp4">
    <img src="{{ '/assets/images/robos-proof-of-work-demo.gif' | relative_url }}" alt="RobOS walkthrough: from idea to reviewed, tested, deployed code" />
  </video>
</div>
<script>
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    var v = document.querySelector('.rb-demo video');
    if (v) { v.removeAttribute('autoplay'); v.pause(); }
  }
</script>

<h2 class="rb-section-title">Where do you want to start?</h2>

<div class="rb-doors">
  <a class="rb-door" href="{{ site.baseurl }}{% link use-robos.md %}" style="--rb-accent: #00e5ff;">
    <div class="rb-door-icon">🖥️</div>
    <div class="rb-door-title">Use RobOS</div>
    <div class="rb-door-who">For everyone</div>
    <div class="rb-door-desc">Install it, tour the app suite, and see what a day with RobOS looks like. No setup knowledge needed.</div>
    <div class="rb-door-go">Start using →</div>
  </a>
  <a class="rb-door" href="{{ site.baseurl }}{% link build-on-robos.md %}" style="--rb-accent: #a78bfa;">
    <div class="rb-door-icon">🧬</div>
    <div class="rb-door-title">Build on RobOS</div>
    <div class="rb-door-who">For app &amp; knowledge graph developers</div>
    <div class="rb-door-desc">Model your system in the knowledge graph, generate and import apps, and write skills that agents can run.</div>
    <div class="rb-door-go">Start building →</div>
  </a>
  <a class="rb-door" href="{{ site.baseurl }}{% link robos-for-teams.md %}" style="--rb-accent: #f59e0b;">
    <div class="rb-door-icon">🏢</div>
    <div class="rb-door-title">RobOS for Teams</div>
    <div class="rb-door-who">For tech leads &amp; evaluators</div>
    <div class="rb-door-desc">Govern coding agents, review AI pull requests you can actually understand, and roll RobOS out across your org.</div>
    <div class="rb-door-go">See why →</div>
  </a>
</div>

<div class="rb-strip">
  <a href="{{ '/demo.html' | relative_url }}">⚡ Big Wins in plain English</a>
  <a href="{{ site.baseurl }}{% link roadmap.md %}">🗺️ Roadmap</a>
  <a href="{{ site.baseurl }}{% link ideas.md %}">💡 Ideas Store</a>
  <a href="{{ site.baseurl }}{% link about.md %}">🌱 About</a>
</div>
