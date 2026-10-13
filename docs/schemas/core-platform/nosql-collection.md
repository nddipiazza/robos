---
title: NoSQL Collection
layout: default
parent: Core Platform
grand_parent: Schemas
nav_order: 14
permalink: /schemas/core-platform/nosql-collection.html
---

# robos:NoSQLCollection
{: .no_toc }

Validation shape for `robos:NoSQLCollection` nodes in the `core-platform` package group.
{: .fs-6 }

## Details

| Detail | Value |
|---|---|
| Class | `robos:NoSQLCollection` |
| Shape id | `urn:robos:shape:NoSQLCollectionShape` |
| Package | [Core Platform]({{ '/schemas/core-platform.html' | relative_url }}) (`core-platform`) |
| Classification | Data stores & messaging |
| Schema.org type | [`schema:Collection`](https://schema.org/Collection) |

## Properties

Count is the minimum and maximum number of values (`*` means no maximum). The validator enforces both. The type column is documentation only; the validator does not check types.

| Property | Count | Type | Rule or description |
|---|---|---|---|
| `dcterms:title` | `1..*` | `xsd:string` | NoSQL Collection must have a title. |
| `robos:collectionName` | `1..*` | `xsd:string` | NoSQL Collection must specify collection name. |
| `robos:database` | `1..*` | `URI (robos:Database \| robos:NoSQLDatabase)` | NoSQL Collection must link to parent database. |

## Example node

The checked-in graph has no node of this class that passes the validator, so this is a placeholder built from the shape. It has every required property, with example values. It is not a node from the graph.

{% raw %}
```json
{
  "@id": "urn:robos:core-platform:nosql-collection-sample",
  "@type": [
    "robos:NoSQLCollection",
    "schema:Collection",
    "oslc:Resource"
  ],
  "dcterms:title": "Sample NoSQL Collection",
  "dcterms:description": "Placeholder node for robos:NoSQLCollection.",
  "robos:package": "core-platform",
  "robos:namespace": "robos.platform",
  "robos:collectionName": "sample_collection",
  "robos:database": "urn:robos:db:acme-orders-postgres",
  "robos:schemaOrgType": "https://schema.org/Collection",
  "robos:domainStandard": "https://schema.org/Collection",
  "robos:refersFrom": "https://schema.org/Collection"
}
```
{% endraw %}

## Validate the example

Save the example as `node.json` in the repository root, then run:

```bash
node -e "const { SHACLValidator } = require('./packages/robos-graph/lib/shacl-validator'); console.log(new SHACLValidator().validate([require('./node.json')]).conforms)"
```

The command prints `true` when the node meets every rule for its types.
