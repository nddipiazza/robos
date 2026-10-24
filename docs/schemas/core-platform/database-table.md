---
title: Database Table
layout: default
parent: "Core Platform (robos.platform)"
grand_parent: Schemas
nav_order: 11
permalink: /schemas/core-platform/database-table.html
description: "Validation shape for robos:DatabaseTable nodes in the core-platform package group."
---

# robos:DatabaseTable
{: .no_toc }

Validation shape for `robos:DatabaseTable` nodes in the `core-platform` package group.
{: .fs-6 }

## Details

| | |
|---|---|
| Class | `robos:DatabaseTable` |
| Shape id | `urn:robos:shape:DatabaseTableShape` |
| Package | [Core Platform (robos.platform)]({{ '/schemas/core-platform.html' | relative_url }}) (`core-platform`) |
| Classification | Data stores & messaging |
| Schema.org type | [`schema:Table`](https://schema.org/Table) |
| Domain standard | [www.iso.org](https://www.iso.org/standard/63555.html) |

## Properties

Count is the minimum and maximum number of values (`*` means no maximum). The validator enforces both. The type column is documentation only; the validator does not check types.

| Property | Count | Type | Rule or description |
|---|---|---|---|
| `dcterms:title` | `1..*` | `xsd:string` | Database Table must have a title. |
| `robos:tableName` | `1..*` | `xsd:string` | Database Table must specify table name. |
| `robos:database` | `1..*` | `URI (robos:Database \| robos:NoSQLDatabase)` | Database Table must link to parent database. |

## Example node

The checked-in graph has no node of this class that passes the validator, so this is a placeholder built from the shape. It has every required property, with example values. It is not a node from the graph.

{% raw %}
```json
{
  "@id": "urn:robos:core-platform:database-table-sample",
  "@type": [
    "robos:DatabaseTable",
    "schema:Table",
    "oslc:Resource"
  ],
  "dcterms:title": "Sample Database Table",
  "dcterms:description": "Placeholder node for robos:DatabaseTable.",
  "robos:package": "core-platform",
  "robos:namespace": "robos.platform",
  "robos:tableName": "sample_table",
  "robos:database": "urn:robos:db:acme-orders-postgres",
  "robos:schemaOrgType": "https://schema.org/Table",
  "robos:domainStandard": "https://www.iso.org/standard/63555.html",
  "robos:refersFrom": "https://schema.org/Table"
}
```
{% endraw %}

## Validate the example

Save the example as `node.json` in the repository root, then run:

```bash
node -e "const { SHACLValidator } = require('./packages/robos-graph/lib/shacl-validator'); console.log(new SHACLValidator().validate([require('./node.json')]).conforms)"
```

The command prints `true` when the node meets every rule for its types.
