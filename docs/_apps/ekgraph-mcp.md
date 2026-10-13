---
title: "Engineering Knowledge Graph MCP Server"
package: ekgraph-mcp
category: services
summary: "An MCP server that lets agents search and edit a small node store, query and propose changes to the SDLC graph, and look up schema types."
description: "ekgraph-mcp runs in two modes. By default it serves a JSON node store seeded with five sample nodes. When ROBOS_GRAPH_ROOT is set it serves the SDLC graph workspace through review-based sdlc tools."
---

This package is an MCP server with a console window. Which tools do real work depends on whether a graph workspace is configured.

## Default mode: node store

With no `ROBOS_GRAPH_ROOT`, the server uses a flat store at `~/.config/robos/ekgraph/nodes.json`. First run seeds five sample nodes (`repos/robos-core`, `services/auth-service`, `services/gateway`, `environments/prod`, `people/ndipiazza`). A node has a `path`, `title`, `type`, `content`, `tags` and `links` to other node paths.

| Tool | What it does |
|---|---|
| `robos_ekgraph_search` | Substring search over path, title, content and tags |
| `robos_ekgraph_get_node` | One node by path |
| `robos_ekgraph_list_children` | Nodes under a path prefix |
| `robos_ekgraph_create_node`, `robos_ekgraph_update_node` | Write to the store |
| `robos_ekgraph_get_linked` | Nodes linked from or to a path |

Resources: `robos://ekgraph-mcp/ekgraph/repos`, `.../services`, `.../environments` and `.../people`.

## Workspace mode: SDLC graph

When `ROBOS_GRAPH_ROOT` names an absolute path to an existing graph workspace, the legacy store is switched off. Its create and update tools then return "Use robos_sdlc_propose/apply for the configured workspace", and four tools from `sdlc-tools.js` are added:

| Tool | What it does |
|---|---|
| `robos_sdlc_inspect` | Graph identity, revision, package counts and validation diagnostics |
| `robos_sdlc_query` | Structured nodes with source evidence, filtered by search, type, package or id |
| `robos_sdlc_propose` | Writes a review draft against a base revision. The canonical graph is not changed |
| `robos_sdlc_apply` | Applies a saved proposal to the canonical graph and may write graph packages and revision state |

The workspace must already be initialized, or the server fails with "Configured canonical SDLC graph is unavailable". Proposals are stored in a `proposals` folder in the workspace. Results are paginated (1 to 100 items).

## Schema tools

In both modes: `robos_schema_lookup` searches Schema.org, OSLC and RobOS vocabularies, `robos_schema_validate` checks a JSON-LD object against Schema.org types and RobOS SHACL shapes, and `robos_schema_synthesize` generates a JSON-LD, TypeSpec, SHACL and code suite from a Schema.org class. They need `packages/schema-studio` (`lib/schema-registry`) and report "SchemaRegistry service not available" without it. See [Schemas]({{ '/schemas.html' | relative_url }}).

## Console and registration

The console window ("EKGraph MCP Server Console") has **Traverse Linked Nodes** and **+ Create Knowledge Node** buttons, a node list and a protocol trace with **Clear Trace**. The server records its tools in `~/.config/robos/mcp/servers.json` under the id `ekgraph` and opens no port unless a `port` option is passed.

```bash
electron packages/ekgraph-mcp
```

Source: [`packages/ekgraph-mcp`](https://github.com/nddipiazza/robos/tree/main/packages/ekgraph-mcp). See also [Knowledge graph]({{ '/knowledge-graph.html' | relative_url }}).
