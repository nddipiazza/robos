---
title: Database Index
layout: default
parent: Core Platform
grand_parent: Schemas
nav_order: 13
permalink: /schemas/core-platform/database-index.html
---

# robos:DatabaseIndex
{: .no_toc }

Validation shape for `robos:DatabaseIndex` nodes in the `core-platform` package group.
{: .fs-6 }

## Details

| Detail | Value |
|---|---|
| Class | `robos:DatabaseIndex` |
| Shape id | `urn:robos:shape:DatabaseIndexShape` |
| Package | [Core Platform]({{ '/schemas/core-platform.html' | relative_url }}) (`core-platform`) |
| Classification | Data stores & messaging |
| Schema.org type | [`schema:Index`](https://schema.org/Index) |
| Domain standard | [www.iso.org](https://www.iso.org/standard/63555.html) |

## Properties

Count is the minimum and maximum number of values (`*` means no maximum). The validator enforces both. The type column is documentation only; the validator does not check types.

| Property | Count | Type | Rule or description |
|---|---|---|---|
| `dcterms:title` | `1..*` | `xsd:string` | Database Index must have a title. |
| `robos:indexName` | `1..*` | `xsd:string` | Database Index must specify index name. |
| `robos:table` | `1..*` | `URI (robos:DatabaseTable)` | Database Index must link to parent table. |

## Example node

The checked-in graph has no node of this class that passes the validator, so this is a placeholder built from the shape. It has every required property, with example values. It is not a node from the graph.

{% raw %}
```json
{
  "@id": "urn:robos:core-platform:database-index-sample",
  "@type": [
    "robos:DatabaseIndex",
    "schema:Index",
    "oslc:Resource"
  ],
  "dcterms:title": "Sample Database Index",
  "dcterms:description": "Placeholder node for robos:DatabaseIndex.",
  "robos:package": "core-platform",
  "robos:namespace": "robos.platform",
  "robos:indexName": "idx_sample_column",
  "robos:table": "urn:robos:db-table:sample-table",
  "robos:schemaOrgType": "https://schema.org/Index",
  "robos:domainStandard": "https://www.iso.org/standard/63555.html",
  "robos:refersFrom": "https://schema.org/Index"
}
```
{% endraw %}

## Validate the example

Save the example as `node.json` in the repository root, then run:

```bash
node -e "const { SHACLValidator } = require('./packages/robos-graph/lib/shacl-validator'); console.log(new SHACLValidator().validate([require('./node.json')]).conforms)"
```

The command prints `true` when the node meets every rule for its types.
