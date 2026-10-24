---
title: MCP Resource
layout: default
parent: "Core Platform (robos.platform)"
grand_parent: Schemas
nav_order: 18
permalink: /schemas/core-platform/mcp-resource.html
description: "Validation shape for robos:MCPResource nodes in the core-platform package group."
---

# robos:MCPResource
{: .no_toc }

Validation shape for `robos:MCPResource` nodes in the `core-platform` package group.
{: .fs-6 }

## Details

| | |
|---|---|
| Class | `robos:MCPResource` |
| Shape id | `urn:robos:shape:MCPResourceShape` |
| Package | [Core Platform (robos.platform)]({{ '/schemas/core-platform.html' | relative_url }}) (`core-platform`) |
| Classification | Agents & MCP |
| Schema.org type | [`schema:MediaObject`](https://schema.org/MediaObject) |
| Domain standard | [MCP specification](https://modelcontextprotocol.io/specification/2025-11-25/schema) |

## Properties

Count is the minimum and maximum number of values (`*` means no maximum). The validator enforces both. The type column is documentation only; the validator does not check types.

| Property | Count | Type | Rule or description |
|---|---|---|---|
| `dcterms:title` | `1..*` | `xsd:string` | MCP Resource must have a title. |
| `robos:uriTemplate` | `0..*` | `xsd:string` | Recorded URI template when applicable; concrete resources use uri instead. |
| `robos:mcpServer` | `1..*` | `URI (robos:MCPServer)` | MCP Resource must link to parent MCP server. |
| `robos:uri` | `0..*` | - | Recorded concrete resource URI; distinct from a URI template. |
| `robos:mimeType` | `0..*` | - | Recorded resource MIME type, when known. |
| `robos:annotations` | `0..*` | - | Recorded MCP resource audience, priority or lastModified annotations. |

## Example node

The checked-in graph has no node of this class that passes the validator, so this is a placeholder built from the shape. It has every required property, with example values. It is not a node from the graph.

{% raw %}
```json
{
  "@id": "urn:robos:core-platform:mcp-resource-sample",
  "@type": [
    "robos:MCPResource",
    "schema:MediaObject",
    "oslc:Resource"
  ],
  "dcterms:title": "Sample MCP Resource",
  "dcterms:description": "Placeholder node for robos:MCPResource.",
  "robos:package": "core-platform",
  "robos:namespace": "robos.platform",
  "robos:uriTemplate": "sample://resources/{id}",
  "robos:mcpServer": "urn:robos:mcp:context-engine",
  "robos:schemaOrgType": "https://schema.org/MediaObject",
  "robos:domainStandard": "https://modelcontextprotocol.io/specification/2025-11-25/schema",
  "robos:refersFrom": "https://schema.org/MediaObject"
}
```
{% endraw %}

## Validate the example

Save the example as `node.json` in the repository root, then run:

```bash
node -e "const { SHACLValidator } = require('./packages/robos-graph/lib/shacl-validator'); console.log(new SHACLValidator().validate([require('./node.json')]).conforms)"
```

The command prints `true` when the node meets every rule for its types.
