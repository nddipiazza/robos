---
title: Data Store
layout: default
parent: Core Platform
grand_parent: Schemas
nav_order: 21
permalink: /schemas/core-platform/data-store.html
---

# robos:DataStore
{: .no_toc }

Validation shape for `robos:DataStore` nodes in the `core-platform` package group.
{: .fs-6 }

## Details

| Detail | Value |
|---|---|
| Class | `robos:DataStore` |
| Shape id | `robos:DataStoreShape` |
| Package | [Core Platform]({{ '/schemas/core-platform.html' | relative_url }}) (`core-platform`) |
| Classification | Data stores & messaging |
| Schema.org type | [`schema:SoftwareApplication`](https://schema.org/SoftwareApplication) |

## Properties

Count is the minimum and maximum number of values (`*` means no maximum). The validator enforces both. The type column is documentation only; the validator does not check types.

| Property | Count | Type | Rule or description |
|---|---|---|---|
| `dcterms:title` | `1..*` | `xsd:string` | Logical data store needs a title. |
| `robos:engine` | `1..*` | - | Logical data store needs its engine. |
| `robos:evidence` | `1..*` | - | Logical data store needs source evidence. |

## Example node

The checked-in graph has no node of this class that passes the validator, so this is a placeholder built from the shape. It has every required property, with example values. It is not a node from the graph.

{% raw %}
```json
{
  "@id": "urn:robos:core-platform:data-store-sample",
  "@type": [
    "robos:DataStore",
    "schema:SoftwareApplication",
    "oslc:Resource"
  ],
  "dcterms:title": "Sample Data Store",
  "dcterms:description": "Placeholder node for robos:DataStore.",
  "robos:package": "core-platform",
  "robos:namespace": "robos.platform",
  "robos:engine": "<engine>",
  "robos:evidence": "<evidence>",
  "robos:schemaOrgType": "https://schema.org/SoftwareApplication",
  "robos:domainStandard": "https://schema.org/SoftwareApplication",
  "robos:refersFrom": "https://schema.org/SoftwareApplication"
}
```
{% endraw %}

## Validate the example

Save the example as `node.json` in the repository root, then run:

```bash
node -e "const { SHACLValidator } = require('./packages/robos-graph/lib/shacl-validator'); console.log(new SHACLValidator().validate([require('./node.json')]).conforms)"
```

The command prints `true` when the node meets every rule for its types.
