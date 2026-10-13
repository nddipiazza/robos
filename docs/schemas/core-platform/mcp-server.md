---
title: MCP Server
layout: default
parent: "Core Platform (robos.platform)"
grand_parent: Schemas
nav_order: 7
permalink: /schemas/core-platform/mcp-server.html
---

# robos:MCPServer
{: .no_toc }

Validation shape for `robos:MCPServer` nodes in the `core-platform` package group.
{: .fs-6 }

## Details

| | |
|---|---|
| Class | `robos:MCPServer` |
| Also matches | `robos:ToolProvider` |
| Shape id | `urn:robos:shape:MCPServerShape` |
| Package | [Core Platform (robos.platform)]({{ '/schemas/core-platform.html' | relative_url }}) (`core-platform`) |
| Classification | Agents & MCP |
| Schema.org type | [`schema:SoftwareApplication`](https://schema.org/SoftwareApplication) |
| Domain standard | [MCP specification](https://modelcontextprotocol.io/specification/2025-11-25/schema) |

## Properties

Count is the minimum and maximum number of values (`*` means no maximum). The validator enforces both. The type column is documentation only; the validator does not check types.

| Property | Count | Type | Rule or description |
|---|---|---|---|
| `dcterms:title` | `1..*` | `xsd:string` | MCP Server must have a title or display name. |
| `robos:transport` | `1..*` | - | MCP Server must declare transport (stdio, Streamable HTTP, or legacy SSE). |
| `robos:toolsProvided` | `0..*` | - | Recorded tools are optional; resources-only and prompts-only MCP servers are valid. |
| `robos:endpoint` | `0..*` | - | Recorded server endpoint; optional for stdio and source declarations. |
| `robos:resourcesProvided` | `0..*` | - | Recorded resource node references; not live discovery. |
| `robos:promptsProvided` | `0..*` | - | Recorded prompt node references; not live discovery. |

## Example node

This node comes from `.robos/kgraphs/core-platform/package.jsonld` in the RobOS repository. That graph holds sample data for a fictional company, so treat the values as illustrations.

{% raw %}
```json
{
  "@id": "urn:robos:mcp:kgraph-navigator",
  "@type": [
    "oslc_am:Resource",
    "robos:MCPServer",
    "robos:ToolProvider",
    "schema:SoftwareApplication"
  ],
  "dcterms:title": "RobOS Knowledge Graph MCP Server",
  "dcterms:description": "Model Context Protocol server allowing autonomous agents to query and validate SDLC graph nodes.",
  "robos:transport": "stdio",
  "robos:command": "/usr/local/bin/robos-kgraph-mcp",
  "robos:toolsProvided": [
    "query_nodes",
    "get_blast_radius",
    "validate_shacl"
  ],
  "robos:package": "core-platform",
  "robos:namespace": "robos.platform",
  "robos:schemaOrgType": "https://schema.org/SoftwareApplication",
  "robos:domainStandard": "https://modelcontextprotocol.io/specification",
  "robos:tools": [
    {
      "name": "query_nodes",
      "description": "Search and filter knowledge graph nodes by type or keyword",
      "inputSchema": {
        "type": "object",
        "properties": {
          "type": {
            "type": "string",
            "description": "RDF type filter"
          },
          "text": {
            "type": "string",
            "description": "Full-text search query"
          },
          "limit": {
            "type": "integer",
            "default": 20
          }
        }
      }
    },
    {
      "name": "blast_radius",
      "description": "Perform recursive dependency and impact traversal for a graph node",
      "inputSchema": {
        "type": "object",
        "properties": {
          "nodeId": {
            "type": "string",
            "description": "Target URN"
          },
          "direction": {
            "type": "string",
            "enum": [
              "upstream",
              "downstream"
            ],
            "default": "downstream"
          }
        },
        "required": [
          "nodeId"
        ]
      }
    }
  ]
}
```
{% endraw %}

## Validate the example

Save the example as `node.json` in the repository root, then run:

```bash
node -e "const { SHACLValidator } = require('./packages/robos-graph/lib/shacl-validator'); console.log(new SHACLValidator().validate([require('./node.json')]).conforms)"
```

The command prints `true` when the node meets every rule for its types.
