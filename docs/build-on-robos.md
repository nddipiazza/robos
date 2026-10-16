---
title: Build on RobOS
layout: default
nav_order: 5
has_children: true
has_toc: false
---

# Build on RobOS
{: .no_toc }

Pages for developers who model systems in the knowledge graph, build applications with the App Wizard, and write skills for agents.
{: .fs-6 }

- [Knowledge graph]({{ site.baseurl }}{% link knowledge-graph.md %}): how RobOS stores a system model as linked data under `.robos/`.
- [Schemas]({{ site.baseurl }}{% link schemas.md %}): the node types and validation shapes the graph accepts.
- [Building apps]({{ site.baseurl }}{% link app-development-flow.md %}): create or import an application project, then work on it with the other RobOS apps.
- [KGraph crawler]({{ site.baseurl }}{% link kgraph-crawler.md %}): pull documents and data sources into the graph.
- [KGraph parse portal]({{ '/kgraph-parse-portal.html' | relative_url }}): the web app and headless service for parsing large volumes of files.
- [Skills]({{ site.baseurl }}{% link robos-skills.md %}): the agent skills shipped in the RobOS plugin and how to add one.
- [Architecture]({{ site.baseurl }}{% link architecture.md %}): how the apps, shared libraries, knowledge graph, agent router and MCP servers fit together.
- [Run evidence generation]({{ site.baseurl }}{% link development/evidence-generator.md %}): generate review evidence from the command line, without opening Code Review.
- [Refinement evidence scope]({{ site.baseurl }}{% link development/course-refinement-validation.md %}): validate graph edits without requiring new evidence on untouched nodes.
