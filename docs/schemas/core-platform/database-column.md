---
title: Database Column
layout: default
parent: Core Platform
grand_parent: Schemas
nav_order: 12
permalink: /schemas/core-platform/database-column.html
---

# robos:DatabaseColumn
{: .no_toc }

Validation shape for `robos:DatabaseColumn` nodes in the `core-platform` package group.
{: .fs-6 }

## Details

| Detail | Value |
|---|---|
| Class | `robos:DatabaseColumn` |
| Shape id | `urn:robos:shape:DatabaseColumnShape` |
| Package | [Core Platform]({{ '/schemas/core-platform.html' | relative_url }}) (`core-platform`) |
| Classification | Data stores & messaging |
| Schema.org type | [`schema:Property`](https://schema.org/Property) |
| Domain standard | [www.iso.org](https://www.iso.org/standard/63555.html) |

## Properties

Count is the minimum and maximum number of values (`*` means no maximum). The validator enforces both. The type column is documentation only; the validator does not check types.

| Property | Count | Type | Rule or description |
|---|---|---|---|
| `dcterms:title` | `1..*` | `xsd:string` | Database Column must have a title. |
| `robos:columnName` | `1..*` | `xsd:string` | Database Column must specify column name. |
| `robos:dataType` | `1..*` | `xsd:string` | Database Column must declare data type. |
| `robos:table` | `1..*` | `URI (robos:DatabaseTable)` | Database Column must link to parent table. |

## Example node

The checked-in graph has no node of this class that passes the validator, so this is a placeholder built from the shape. It has every required property, with example values. It is not a node from the graph.

{% raw %}
```json
{
  "@id": "urn:robos:core-platform:database-column-sample",
  "@type": [
    "robos:DatabaseColumn",
    "schema:Property",
    "oslc:Resource"
  ],
  "dcterms:title": "Sample Database Column",
  "dcterms:description": "Placeholder node for robos:DatabaseColumn.",
  "robos:package": "core-platform",
  "robos:namespace": "robos.platform",
  "robos:columnName": "sample_column",
  "robos:dataType": "varchar(255)",
  "robos:table": "urn:robos:db-table:sample-table",
  "robos:schemaOrgType": "https://schema.org/Property",
  "robos:domainStandard": "https://www.iso.org/standard/63555.html",
  "robos:refersFrom": "https://schema.org/Property"
}
```
{% endraw %}

## Validate the example

Save the example as `node.json` in the repository root, then run:

```bash
node -e "const { SHACLValidator } = require('./packages/robos-graph/lib/shacl-validator'); console.log(new SHACLValidator().validate([require('./node.json')]).conforms)"
```

The command prints `true` when the node meets every rule for its types.
