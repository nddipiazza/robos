---
title: "Knowledge Graph Explorer"
package: robos-graph
category: arch-planning
summary: "Browse, search, edit and validate the knowledge graph of your software, compare main with a branch, and import or refine graph data from source repositories."
description: "Explorer and engine for the JSON-LD knowledge graph stored in .robos. It also provides the kgraph command-line tool and the graph library other RobOS apps depend on."
related:
  - /knowledge-graph.html
icon: robos-graph.svg
---

This package is both a window and a library. The graph store in `lib/graph-store.js` is loaded by many other RobOS apps (eLearning Hub, Documentation, Preferences, Task Servers and more). For what the graph holds and why, see [Knowledge graph]({{ site.baseurl }}{% link knowledge-graph.md %}).

## Where the data lives

By default the store reads `.robos/knowledge-graph.jsonld` and the per-package files in `.robos/kgraphs/<package>/package.jsonld` of the repository. To work on a different project, set `ROBOS_GRAPH_ROOT` to its directory (or its `.robos` directory), or pass `--graph-root` to the CLI. A graph workspace chosen this way starts empty, is checked for consistency between the aggregate file and the package files, and has no demonstration branches. Details are in `packages/robos-graph/WORKSPACES.md`.

## The window

- **Graph Nodes** (left): every node, grouped by **Classification**, **Package**, **Type** or **Flat**, with search and package and type filters. **Add Entity** creates a node, and **Ingest** imports from repositories or resources. Both validate against the SHACL shapes before saving.
- **Detail tabs** (right) for the selected node: **Overview**, **Project Plan** (project nodes only), **Topology** (its relationships), **Impact** (what depends on it, with counts), **Documentation** and **Source Evidence** (only when the node has them) and **JSON-LD**. You can edit a node as a form or as a JSON-LD patch, or delete it.
- **Header buttons:** **Import & Refine**, **DevOps Integrations**, **Packages & Repos** (add a repository and sync it into the graph), **Generate eLearning**, **Semantic Diff** and **Validate SHACL**. The **Branch** selector switches between graph branches, and Semantic Diff compares the selected branch with `main`.
- **AI Co-Pilot:** a text box where you describe a change. **AI Co-Pilot Generate** drafts nodes and **Apply to Graph** adds them after validation. It uses the shared RobOS AI agent library, so a provider must be configured.

Without an explicit workspace the Branch list contains sample branches that ship in `lib/branch-manager.js`, such as `feature/TASK-101-auth`.

### Import & Refine

With `ROBOS_GRAPH_ROOT` set, **Import & Refine** lets you describe a correction, click **Prepare agent brief** to see the matching records and their source evidence, give the brief to your coding agent, then paste its JSON edits under "Advanced". **Preview changes** shows the diff, evidence and validation result, and **Save reviewed revision** applies it. A conflict or validation failure blocks saving. **Ask configured agent** needs `ROBOS_GRAPH_AGENT_URL`, `ROBOS_GRAPH_AGENT_HARNESS` and `ROBOS_GRAPH_AGENT_MODEL`, and it never saves on its own. See `IMPORT-REFINE.md` in the package.

## The kgraph command

`packages/robos-graph/bin/kgraph-cli.js` is exposed as `kgraph`. Run it with `--help` for all flags. Commands include:

```bash
node packages/robos-graph/bin/kgraph-cli.js search "order events" --json
node packages/robos-graph/bin/kgraph-cli.js get <node-id>
node packages/robos-graph/bin/kgraph-cli.js impact <node-id> --depth 3
node packages/robos-graph/bin/kgraph-cli.js validate --strict
node packages/robos-graph/bin/kgraph-cli.js diff feature/TASK-101-auth --base main
node packages/robos-graph/bin/kgraph-cli.js export --format ttl --output graph.ttl
```

Other commands: `index`, `insert`, `update`, `delete`, `query`, and for external workspaces `init`, `inspect`, `context`, `propose`, `apply` and `recover`.

## Run it

Run `npm start` in `packages/robos-graph`. `npm test` runs the package tests.
