---
title: MCP Tool
layout: default
parent: "Core Platform (robos.platform)"
grand_parent: Schemas
nav_order: 17
permalink: /schemas/core-platform/mcp-tool.html
---

# robos:MCPTool
{: .no_toc }

Validation shape for `robos:MCPTool` nodes in the `core-platform` package group.
{: .fs-6 }

## Details

| | |
|---|---|
| Class | `robos:MCPTool` |
| Shape id | `urn:robos:shape:MCPToolShape` |
| Package | [Core Platform (robos.platform)]({{ '/schemas/core-platform.html' | relative_url }}) (`core-platform`) |
| Classification | Agents & MCP |
| Schema.org type | [`schema:Action`](https://schema.org/Action) |
| Domain standard | [MCP specification](https://modelcontextprotocol.io/specification/2025-11-25/schema) |

## Properties

Count is the minimum and maximum number of values (`*` means no maximum). The validator enforces both. The type column is documentation only; the validator does not check types.

| Property | Count | Type | Rule or description |
|---|---|---|---|
| `dcterms:title` | `1..*` | `xsd:string` | MCP Tool must have a title. |
| `robos:toolName` | `1..*` | `xsd:string` | MCP Tool must declare tool name. |
| `robos:mcpServer` | `1..*` | `URI (robos:MCPServer)` | MCP Tool must link to parent MCP server. |
| `robos:inputSchema` | `0..*` | - | Recorded MCP tool input JSON Schema; optional in an incomplete knowledge graph. |
| `robos:outputSchema` | `0..*` | - | Recorded JSON Schema for structured tool output. |
| `robos:annotations` | `0..*` | - | Recorded MCP ToolAnnotations hints, not verified safety guarantees. |
| `robos:toolAnnotations` | `0..*` | - | Compatibility spelling for recorded MCP ToolAnnotations; preserve without inventing hints. |
| `robos:parameters` | `0..*` | - | Legacy parameter description; not automatically equivalent to inputSchema. |

## Example node

The checked-in graph has no node of this class that passes the validator, so this is a placeholder built from the shape. It has every required property, with example values. It is not a node from the graph.

{% raw %}
```json
{
  "@id": "urn:robos:core-platform:mcp-tool-sample",
  "@type": [
    "robos:MCPTool",
    "schema:Action",
    "oslc:Resource"
  ],
  "dcterms:title": "Sample MCP Tool",
  "dcterms:description": "Placeholder node for robos:MCPTool.",
  "robos:package": "core-platform",
  "robos:namespace": "robos.platform",
  "robos:toolName": "sample_tool",
  "robos:mcpServer": "urn:robos:mcp:context-engine",
  "robos:schemaOrgType": "https://schema.org/Action",
  "robos:domainStandard": "https://modelcontextprotocol.io/specification/2025-11-25/schema",
  "robos:refersFrom": "https://schema.org/Action"
}
```
{% endraw %}

## Validate the example

Save the example as `node.json` in the repository root, then run:

```bash
node -e "const { SHACLValidator } = require('./packages/robos-graph/lib/shacl-validator'); console.log(new SHACLValidator().validate([require('./node.json')]).conforms)"
```

The command prints `true` when the node meets every rule for its types.
