---
title: Examples Table
layout: default
parent: "Testing, Quality & BDD (robos.testing)"
grand_parent: Schemas
nav_order: 14
permalink: /schemas/testing/examples-table.html
description: "Validation shape for robos:ExamplesTable nodes in the testing package group."
---

# robos:ExamplesTable
{: .no_toc }

Validation shape for `robos:ExamplesTable` nodes in the `testing` package group.
{: .fs-6 }

## Details

| | |
|---|---|
| Class | `robos:ExamplesTable` |
| Shape id | `urn:robos:shape:ExamplesTableShape` |
| Package | [Testing, Quality & BDD (robos.testing)]({{ '/schemas/testing.html' | relative_url }}) (`testing`) |
| Classification | Testing & behavior |
| Schema.org type | [`schema:Table`](https://schema.org/Table) |
| Domain standard | [Cucumber](https://cucumber.io/docs/gherkin/reference/#examples) |

## Properties

Count is the minimum and maximum number of values (`*` means no maximum). The validator enforces both. The type column is documentation only; the validator does not check types.

| Property | Count | Type | Rule or description |
|---|---|---|---|
| `dcterms:title` | `1..*` | `xsd:string` | Examples Table must have a title. |
| `robos:tableHeaders` | `1..*` | `Array of xsd:string` | Examples Table must define header column names. |
| `robos:tableRows` | `1..*` | `Array of Arrays` | Examples Table must define parameter value rows. |

## Example node

This node comes from `.robos/kgraphs/testing/package.jsonld` in the RobOS repository. That graph holds sample data for a fictional company, so treat the values as illustrations.

{% raw %}
```json
{
  "@id": "urn:robos:examples:checkout-loyalty-tiers",
  "@type": [
    "robos:ExamplesTable",
    "schema:Table"
  ],
  "dcterms:title": "Loyalty Tier Discounts",
  "robos:tableHeaders": [
    "tier",
    "amount",
    "discount"
  ],
  "robos:tableRows": [
    [
      "Bronze",
      "100",
      "5%"
    ],
    [
      "Silver",
      "100",
      "10%"
    ],
    [
      "Gold",
      "100",
      "20%"
    ]
  ],
  "robos:package": "testing",
  "robos:namespace": "robos.testing",
  "robos:refersFrom": "https://cucumber.io/docs/gherkin/reference/#examples",
  "robos:schemaOrgType": "https://schema.org/Table",
  "robos:domainStandard": "https://cucumber.io/docs/gherkin/reference/#examples"
}
```
{% endraw %}

## Validate the example

Save the example as `node.json` in the repository root, then run:

```bash
node -e "const { SHACLValidator } = require('./packages/robos-graph/lib/shacl-validator'); console.log(new SHACLValidator().validate([require('./node.json')]).conforms)"
```

The command prints `true` when the node meets every rule for its types.
