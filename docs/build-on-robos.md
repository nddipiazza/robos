---
title: Build on RobOS
layout: default
nav_order: 5
has_children: true
has_toc: false
description: "Pages for developers who model systems in the knowledge graph, build applications with the App Wizard, and write skills for agents."
---

# Build on RobOS
{: .no_toc }

Pages for developers who model systems in the knowledge graph, build applications with the App Wizard, and write skills for agents.
{: .fs-6 }

{: .tip }
To take an app from a plan to merged pull requests with Task Planner, Task Implementer and Agent Code Review, follow the Build apps guides on rowbose.com: [on your own](/build-apps/solo/) or [as a team](/build-apps/teams/).

- [Knowledge graph]({{ site.baseurl }}{% link knowledge-graph.md %}): how RobOS stores a system model as linked data under `.robos/`.
- [Schemas]({{ site.baseurl }}{% link schemas.md %}): the node types and validation shapes the graph accepts.
- [Building apps]({{ site.baseurl }}{% link app-development-flow.md %}): create or import an application project, then work on it with the other RobOS apps.
- [KGraph crawler]({{ site.baseurl }}{% link kgraph-crawler.md %}): pull documents and data sources into the graph.
- [KGraph parse portal]({{ '/kgraph-parse-portal.html' | relative_url }}): the web app and headless service for parsing large volumes of files.
- [Skills]({{ site.baseurl }}{% link robos-skills.md %}): the agent skills shipped in the RobOS plugin and how to add one.
- [Architecture]({{ site.baseurl }}{% link architecture.md %}): how the apps, shared libraries, knowledge graph, agent router and MCP servers fit together.
- [AI agents and API mode]({{ site.baseurl }}{% link ai-providers.md %}): call `robos-lib/ai-agent` from an app, and what the optional `robos-llm` API mode adds.
- [Run evidence generation]({{ site.baseurl }}{% link development/evidence-generator.md %}): generate review evidence from the command line, without opening Code Review.
- [Refinement evidence scope]({{ site.baseurl }}{% link development/course-refinement-validation.md %}): validate graph edits without requiring new evidence on untouched nodes.
