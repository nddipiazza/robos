---
title: Context Source
layout: default
parent: "Core Platform (robos.platform)"
grand_parent: Schemas
nav_order: 8
permalink: /schemas/core-platform/context-source.html
---

# robos:ContextSource
{: .no_toc }

Validation shape for `robos:ContextSource` nodes in the `core-platform` package group.
{: .fs-6 }

## Details

| | |
|---|---|
| Class | `robos:ContextSource` |
| Shape id | `urn:robos:shape:ContextSourceShape` |
| Package | [Core Platform (robos.platform)]({{ '/schemas/core-platform.html' | relative_url }}) (`core-platform`) |
| Classification | Agents & MCP |
| Schema.org type | [`schema:DataFeed`](https://schema.org/DataFeed) |

## Properties

Count is the minimum and maximum number of values (`*` means no maximum). The validator enforces both. The type column is documentation only; the validator does not check types.

| Property | Count | Type | Rule or description |
|---|---|---|---|
| `dcterms:title` | `1..*` | `xsd:string` | Context Source must have a title. |
| `robos:sourceType` | `1..*` | `xsd:string` | Context Source must declare source type (file, folder, url, github, repo, ticket). |
| `robos:location` | `1..*` | - | Context Source must specify location path, URL, or repository identifier. |

## Example node

The checked-in graph has no node of this class that passes the validator, so this is a placeholder built from the shape. It has every required property, with example values. It is not a node from the graph.

{% raw %}
```json
{
  "@id": "urn:robos:core-platform:context-source-sample",
  "@type": [
    "robos:ContextSource",
    "schema:DataFeed",
    "oslc:Resource"
  ],
  "dcterms:title": "Sample Context Source",
  "dcterms:description": "Placeholder node for robos:ContextSource.",
  "robos:package": "core-platform",
  "robos:namespace": "robos.platform",
  "robos:sourceType": "<sourceType>",
  "robos:location": "<location>",
  "robos:schemaOrgType": "https://schema.org/DataFeed",
  "robos:domainStandard": "https://schema.org/DataFeed",
  "robos:refersFrom": "https://schema.org/DataFeed"
}
```
{% endraw %}

## Validate the example

Save the example as `node.json` in the repository root, then run:

```bash
node -e "const { SHACLValidator } = require('./packages/robos-graph/lib/shacl-validator'); console.log(new SHACLValidator().validate([require('./node.json')]).conforms)"
```

The command prints `true` when the node meets every rule for its types.
