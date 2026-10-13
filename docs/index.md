---
title: Home
layout: default
nav_order: 1
permalink: /
---

# RobOS documentation
{: .no_toc }

RobOS is a desktop suite of developer apps, a knowledge graph of your system, and review tools that show what a coding agent changed and prove it works.
{: .rb-home-lead }

<div class="rb-home-actions">
  <a href="{{ site.baseurl }}{% link getting-started.md %}" class="btn btn-primary">Get started</a>
  <a href="{{ site.baseurl }}{% link apps.md %}" class="btn">Browse the apps</a>
  <a href="https://github.com/nddipiazza/robos" class="btn" target="_blank" rel="noopener">Source on GitHub</a>
</div>

## Where to start

<div class="rb-links">
  <a class="rb-link" href="{{ site.baseurl }}{% link use-robos.md %}">
    <strong>Use RobOS</strong>
    <span>Install it, tour the apps, and follow a task from idea to merged pull request.</span>
  </a>
  <a class="rb-link" href="{{ site.baseurl }}{% link agent-review-development.md %}">
    <strong>Review and governance</strong>
    <span>PR Review Theater, recorded walkthroughs, and how agent work is checked before it merges.</span>
  </a>
  <a class="rb-link" href="{{ site.baseurl }}{% link build-on-robos.md %}">
    <strong>Build on RobOS</strong>
    <span>Model your system in the knowledge graph, generate or import apps, and write skills.</span>
  </a>
  <a class="rb-link" href="{{ site.baseurl }}{% link robos-for-teams.md %}">
    <strong>RobOS for Teams</strong>
    <span>What RobOS is for, how it differs, and how to set it up for an organization.</span>
  </a>
</div>

## How the pieces fit

RobOS is a set of Electron desktop apps that share libraries and one knowledge graph. Agents run through a router, and MCP servers expose the graph and the apps to other tools.

```mermaid
flowchart LR
  apps["Electron apps (packages/*)"]
  lib["robos-lib"]
  ui["robos-ui"]
  rgraph["robos-graph"]
  kg[".robos/kgraphs/*/package.jsonld"]
  client["robos-agent-client"]
  clis["claude, codex, copilot CLIs"]
  servers["MCP servers (*-mcp)"]
  mcplib["robos-mcp-lib"]
  registry["~/.config/robos/mcp/servers.json"]
  router["robos-mcp-router"]
  mcpclient["MCP client, for example Claude Code"]

  apps --> lib
  apps --> ui
  apps --> rgraph
  rgraph --> kg
  apps --> client
  client --> clis
  servers --> mcplib
  mcplib --> registry
  router --> registry
  mcpclient --> router
```

Each arrow is a `require`, a file read or a spawned process in the source. The [architecture overview]({{ site.baseurl }}{% link architecture.md %}) walks through each box.

## Also here

- [Roadmap]({{ site.baseurl }}{% link roadmap.md %}): what is built, in progress and planned.
- [Training]({{ site.baseurl }}{% link training.md %}): task-oriented lessons.
- [About]({{ site.baseurl }}{% link about.md %}): the project, the license and where to ask questions.
- [rowbose.com](https://rowbose.com/): the project home page.
