---
title: Data Table
layout: default
parent: "Testing, Quality & BDD (robos.testing)"
grand_parent: Schemas
nav_order: 16
permalink: /schemas/testing/data-table.html
description: "Validation shape for robos:DataTable nodes in the testing package group."
---

# robos:DataTable
{: .no_toc }

Validation shape for `robos:DataTable` nodes in the `testing` package group.
{: .fs-6 }

## Details

| | |
|---|---|
| Class | `robos:DataTable` |
| Shape id | `urn:robos:shape:DataTableShape` |
| Package | [Testing, Quality & BDD (robos.testing)]({{ '/schemas/testing.html' | relative_url }}) (`testing`) |
| Classification | Testing & behavior |
| Schema.org type | [`schema:Table`](https://schema.org/Table) |
| Domain standard | [Cucumber](https://cucumber.io/docs/gherkin/reference/#data-tables) |

## Properties

Count is the minimum and maximum number of values (`*` means no maximum). The validator enforces both. The type column is documentation only; the validator does not check types.

| Property | Count | Type | Rule or description |
|---|---|---|---|
| `robos:tableRows` | `1..*` | `Array of Arrays` | Data Table must specify data rows. |
| `robos:step` | `1..*` | - | Data Table must link to parent scenario step. |

## Example node

This node comes from `.robos/kgraphs/testing/package.jsonld` in the RobOS repository. That graph holds sample data for a fictional company, so treat the values as illustrations.

{% raw %}
```json
{
  "@id": "urn:robos:datatable:cart-items",
  "@type": [
    "robos:DataTable",
    "schema:Table"
  ],
  "robos:step": "urn:robos:step:checkout-add-item-with-table",
  "robos:tableRows": [
    [
      "sku",
      "quantity",
      "price"
    ],
    [
      "SKU-101",
      "2",
      "19.99"
    ],
    [
      "SKU-202",
      "1",
      "49.50"
    ]
  ],
  "robos:package": "testing",
  "robos:namespace": "robos.testing",
  "robos:refersFrom": "https://cucumber.io/docs/gherkin/reference/#data-tables",
  "robos:schemaOrgType": "https://schema.org/Table",
  "robos:domainStandard": "https://cucumber.io/docs/gherkin/reference/#data-tables"
}
```
{% endraw %}

## Validate the example

Save the example as `node.json` in the repository root, then run:

```bash
node -e "const { SHACLValidator } = require('./packages/robos-graph/lib/shacl-validator'); console.log(new SHACLValidator().validate([require('./node.json')]).conforms)"
```

The command prints `true` when the node meets every rule for its types.
