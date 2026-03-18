# Story 15-06: EKGraph MCP Server

**Epic:** [First-Class MCP Server Support](epic.md)
**Status:** Not started
**Points:** 3

## Description

MCP server exposing the Engineering Knowledge Graph to AI agents. This is one of the most valuable servers — it gives agents instant access to all company engineering knowledge.

Tools:
- `robos_ekgraph_search` — Natural language search across all nodes
- `robos_ekgraph_get_node` — Get a specific node by path
- `robos_ekgraph_list_children` — List children of a node
- `robos_ekgraph_create_node` — Create a new knowledge node
- `robos_ekgraph_update_node` — Update node content
- `robos_ekgraph_get_linked` — Get nodes linked to a given node

Resources:
- `robos://ekgraph/repos` — All repository nodes
- `robos://ekgraph/services` — All service nodes
- `robos://ekgraph/environments` — All environment nodes (dev, staging, prod)
- `robos://ekgraph/people` — All team member nodes
- `robos://ekgraph/{path}` — Any node by path

## Acceptance Criteria

- [ ] AI agent can find any piece of company knowledge via search
- [ ] Repo URLs, service endpoints, logging locations all queryable
- [ ] Agent can create/update nodes (with human review flag)
