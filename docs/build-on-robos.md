---
title: Build on RobOS
layout: default
nav_order: 1.2
---

# Build on RobOS
{: .no_toc }

For developers modeling systems in the knowledge graph, building apps, and writing skills for agents.
{: .fs-6 .fw-300 }

## Start here

1. **[Understand the knowledge graph]({{ site.baseurl }}{% link knowledge-graph.md %})**: the model of your system that everything else in RobOS reads from and writes to.
2. **[Walk the app development flow]({{ site.baseurl }}{% link app-development-flow.md %})**: from setting up your org to scaffolding, debugging, review and deployment.
3. **[Create your first app]({{ site.baseurl }}{% link new-app-wizard.md %})** with the App Wizard, or **[import one you already have]({{ site.baseurl }}{% link app-import-wizard.md %})**.

## Knowledge graph

<div class="rb-links">
  <a class="rb-link" href="{{ site.baseurl }}{% link schemas.md %}">
    <strong>📐 KGraph schemas</strong>
    <span>The node types and constraints for every package store.</span>
  </a>
  <a class="rb-link" href="{{ site.baseurl }}{% link skills/import-company-kgraph.md %}">
    <strong>📥 Import a company knowledge graph</strong>
    <span>Generate a knowledge graph from your existing repos.</span>
  </a>
  <a class="rb-link" href="{{ site.baseurl }}{% link kgraph-crawler.md %}">
    <strong>🕷️ KGraph Crawler</strong>
    <span>Pull documents and data sources into the graph and infer schemas from them.</span>
  </a>
  <a class="rb-link" href="{{ site.baseurl }}{% link kgraph-parse-portal.md %}">
    <strong>🔎 KGraph Parse Portal</strong>
    <span>Connectors and headless parsing at scale, backed by a search index.</span>
  </a>
</div>

## Apps

<div class="rb-links">
  <a class="rb-link" href="{{ site.baseurl }}{% link architecture.md %}">
    <strong>🏗️ System architecture</strong>
    <span>How RobOS is put together: the app archetypes, the dual-state engine and the desktop bridge.</span>
  </a>
  <a class="rb-link" href="{{ site.baseurl }}{% link frontend-applications.md %}">
    <strong>🌐 Front end applications</strong>
    <span>Build SPA and SSR web apps.</span>
  </a>
  <a class="rb-link" href="{{ site.baseurl }}{% link game-development.md %}">
    <strong>🎮 Game development</strong>
    <span>Build PC and mobile game projects.</span>
  </a>
  <a class="rb-link" href="{{ site.baseurl }}{% link apps.md %}">
    <strong>📱 App suite reference</strong>
    <span>Every built-in app, for when you're wiring into one.</span>
  </a>
</div>

## Skills & agents

<div class="rb-links">
  <a class="rb-link" href="{{ site.baseurl }}{% link robos-skills.md %}">
    <strong>⚡ RobOS Skills</strong>
    <span>Write skills that run the same way in Claude Code, Codex, Copilot, Gemini and Antigravity.</span>
  </a>
  <a class="rb-link" href="{{ site.baseurl }}{% link agent-tiers.md %}">
    <strong>🧠 Agent tiers & model dispatch</strong>
    <span>How tasks get sent to the right model tier.</span>
  </a>
</div>
