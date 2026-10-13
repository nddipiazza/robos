---
title: Scenario Outline
layout: default
parent: "Testing & BDD"
grand_parent: Schemas
nav_order: 13
permalink: /schemas/testing/scenario-outline.html
---

# robos:ScenarioOutline
{: .no_toc }

Validation shape for `robos:ScenarioOutline` nodes in the `testing` package group.
{: .fs-6 }

## Details

| Detail | Value |
|---|---|
| Class | `robos:ScenarioOutline` |
| Shape id | `urn:robos:shape:ScenarioOutlineShape` |
| Package | [Testing & BDD]({{ '/schemas/testing.html' | relative_url }}) (`testing`) |
| Classification | Testing & behavior |
| Schema.org type | [`schema:CheckAction`](https://schema.org/CheckAction) |
| Domain standard | [Cucumber](https://cucumber.io/docs/gherkin/reference/#scenario-outline) |

## Properties

Count is the minimum and maximum number of values (`*` means no maximum). The validator enforces both. The type column is documentation only; the validator does not check types.

| Property | Count | Type | Rule or description |
|---|---|---|---|
| `dcterms:title` | `1..*` | `xsd:string` | Scenario Outline must have a title. |
| `robos:steps` | `1..*` | `Array<robos:ScenarioStep>` | Scenario Outline must define template execution steps. |
| `robos:examplesTable` | `1..*` | `URI (robos:ExamplesTable)` | Scenario Outline must link to an Examples table. |

## Example node

This node comes from `.robos/kgraphs/testing/package.jsonld` in the RobOS repository. That graph holds sample data for a fictional company, so treat the values as illustrations.

{% raw %}
```json
{
  "@id": "urn:robos:scenario-outline:checkout-discount-tiers",
  "@type": [
    "robos:ScenarioOutline",
    "oslc_qm:TestCase",
    "schema:CheckAction"
  ],
  "dcterms:title": "Discount tier calculation for loyalty members",
  "dcterms:description": "Parameterized verification of discount percentages by customer loyalty membership level.",
  "robos:inFeature": "urn:robos:gherkin:checkout-cart-validation",
  "robos:steps": [
    "Given customer loyalty tier is <tier>",
    "When order subtotal is <amount>",
    "Then calculated discount is <discount>"
  ],
  "robos:examplesTable": "urn:robos:examples:checkout-loyalty-tiers",
  "robos:package": "testing",
  "robos:namespace": "robos.testing",
  "robos:refersFrom": "https://cucumber.io/docs/gherkin/reference/#scenario-outline",
  "robos:schemaOrgType": "https://schema.org/CheckAction",
  "robos:domainStandard": "https://cucumber.io/docs/gherkin/reference/#scenario-outline"
}
```
{% endraw %}

## Validate the example

Save the example as `node.json` in the repository root, then run:

```bash
node -e "const { SHACLValidator } = require('./packages/robos-graph/lib/shacl-validator'); console.log(new SHACLValidator().validate([require('./node.json')]).conforms)"
```

The command prints `true` when the node meets every rule for its types.
