---
title: MCP Prompt
layout: default
parent: "Core Platform (robos.platform)"
grand_parent: Schemas
nav_order: 19
permalink: /schemas/core-platform/mcp-prompt.html
---

# robos:MCPPrompt
{: .no_toc }

Validation shape for `robos:MCPPrompt` nodes in the `core-platform` package group.
{: .fs-6 }

## Details

| | |
|---|---|
| Class | `robos:MCPPrompt` |
| Shape id | `urn:robos:shape:MCPPromptShape` |
| Package | [Core Platform (robos.platform)]({{ '/schemas/core-platform.html' | relative_url }}) (`core-platform`) |
| Classification | Agents & MCP |
| Schema.org type | [`schema:Text`](https://schema.org/Text) |
| Domain standard | [MCP specification](https://modelcontextprotocol.io/specification/2025-11-25/schema) |

## Properties

Count is the minimum and maximum number of values (`*` means no maximum). The validator enforces both. The type column is documentation only; the validator does not check types.

| Property | Count | Type | Rule or description |
|---|---|---|---|
| `dcterms:title` | `1..*` | `xsd:string` | MCP Prompt must have a title. |
| `robos:promptName` | `1..*` | `xsd:string` | MCP Prompt must declare prompt name. |
| `robos:mcpServer` | `1..*` | `URI (robos:MCPServer)` | MCP Prompt must link to parent MCP server. |
| `robos:arguments` | `0..*` | - | Recorded prompt argument descriptors, not invocation argument values. |

## Example node

The checked-in graph has no node of this class that passes the validator, so this is a placeholder built from the shape. It has every required property, with example values. It is not a node from the graph.

{% raw %}
```json
{
  "@id": "urn:robos:core-platform:mcp-prompt-sample",
  "@type": [
    "robos:MCPPrompt",
    "schema:Text",
    "oslc:Resource"
  ],
  "dcterms:title": "Sample MCP Prompt",
  "dcterms:description": "Placeholder node for robos:MCPPrompt.",
  "robos:package": "core-platform",
  "robos:namespace": "robos.platform",
  "robos:promptName": "sample_prompt",
  "robos:mcpServer": "urn:robos:mcp:context-engine",
  "robos:schemaOrgType": "https://schema.org/Text",
  "robos:domainStandard": "https://modelcontextprotocol.io/specification/2025-11-25/schema",
  "robos:refersFrom": "https://schema.org/Text"
}
```
{% endraw %}

## Validate the example

Save the example as `node.json` in the repository root, then run:

```bash
node -e "const { SHACLValidator } = require('./packages/robos-graph/lib/shacl-validator'); console.log(new SHACLValidator().validate([require('./node.json')]).conforms)"
```

The command prints `true` when the node meets every rule for its types.
