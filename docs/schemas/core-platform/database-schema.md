---
title: Database Schema
layout: default
parent: Core Platform
grand_parent: Schemas
nav_order: 10
permalink: /schemas/core-platform/database-schema.html
---

# robos:DatabaseSchema
{: .no_toc }

Validation shape for `robos:DatabaseSchema` nodes in the `core-platform` package group.
{: .fs-6 }

## Details

| Detail | Value |
|---|---|
| Class | `robos:DatabaseSchema` |
| Shape id | `urn:robos:shape:DatabaseSchemaShape` |
| Package | [Core Platform]({{ '/schemas/core-platform.html' | relative_url }}) (`core-platform`) |
| Classification | Data stores & messaging |
| Schema.org type | [`schema:DataStore`](https://schema.org/DataStore) |
| Domain standard | [www.iso.org](https://www.iso.org/standard/63555.html) |

## Properties

Count is the minimum and maximum number of values (`*` means no maximum). The validator enforces both. The type column is documentation only; the validator does not check types.

| Property | Count | Type | Rule or description |
|---|---|---|---|
| `dcterms:title` | `1..*` | `xsd:string` | Database Schema must have a title. |
| `robos:schemaName` | `1..*` | `xsd:string` | Database Schema must specify schema name. |
| `robos:database` | `1..*` | `URI (robos:Database \| robos:NoSQLDatabase)` | Database Schema must link to parent database. |

## Example node

The checked-in graph has no node of this class that passes the validator, so this is a placeholder built from the shape. It has every required property, with example values. It is not a node from the graph.

{% raw %}
```json
{
  "@id": "urn:robos:core-platform:database-schema-sample",
  "@type": [
    "robos:DatabaseSchema",
    "schema:DataStore",
    "oslc:Resource"
  ],
  "dcterms:title": "Sample Database Schema",
  "dcterms:description": "Placeholder node for robos:DatabaseSchema.",
  "robos:package": "core-platform",
  "robos:namespace": "robos.platform",
  "robos:schemaName": "public",
  "robos:database": "urn:robos:db:acme-orders-postgres",
  "robos:schemaOrgType": "https://schema.org/DataStore",
  "robos:domainStandard": "https://www.iso.org/standard/63555.html",
  "robos:refersFrom": "https://schema.org/DataStore"
}
```
{% endraw %}

## Validate the example

Save the example as `node.json` in the repository root, then run:

```bash
node -e "const { SHACLValidator } = require('./packages/robos-graph/lib/shacl-validator'); console.log(new SHACLValidator().validate([require('./node.json')]).conforms)"
```

The command prints `true` when the node meets every rule for its types.
