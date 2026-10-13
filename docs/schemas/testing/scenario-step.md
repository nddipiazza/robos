---
title: Scenario Step
layout: default
parent: "Testing & BDD"
grand_parent: Schemas
nav_order: 2
permalink: /schemas/testing/scenario-step.html
---

# robos:ScenarioStep
{: .no_toc }

Validation shape for `robos:ScenarioStep` nodes in the `testing` package group.
{: .fs-6 }

## Details

| Detail | Value |
|---|---|
| Class | `robos:ScenarioStep` |
| Shape id | `urn:robos:shape:ScenarioStepShape` |
| Package | [Testing & BDD]({{ '/schemas/testing.html' | relative_url }}) (`testing`) |
| Classification | Testing & behavior |
| Schema.org type | [`schema:HowToStep`](https://schema.org/HowToStep) |
| Domain standard | [Cucumber](https://cucumber.io/docs/gherkin/reference/#steps) |

## Properties

Count is the minimum and maximum number of values (`*` means no maximum). The validator enforces both. The type column is documentation only; the validator does not check types.

| Property | Count | Type | Rule or description |
|---|---|---|---|
| `robos:keyword` | `1..*` | `xsd:string` | Scenario Step must specify keyword (Given, When, Then, And, But). |
| `robos:stepText` | `1..*` | `xsd:string` | Scenario Step must specify step expression text. |

## Example node

This node comes from `.robos/kgraphs/testing/package.jsonld` in the RobOS repository. That graph holds sample data for a fictional company, so treat the values as illustrations.

{% raw %}
```json
{
  "@id": "urn:robos:step:checkout-add-item-with-table",
  "@type": [
    "robos:ScenarioStep",
    "schema:HowToStep"
  ],
  "robos:keyword": "When",
  "robos:stepText": "the customer adds items to cart with configuration",
  "robos:dataTable": "urn:robos:datatable:cart-items",
  "robos:package": "testing",
  "robos:namespace": "robos.testing",
  "robos:refersFrom": "https://cucumber.io/docs/gherkin/reference/#steps",
  "robos:schemaOrgType": "https://schema.org/HowToStep",
  "robos:domainStandard": "https://cucumber.io/docs/gherkin/reference/#steps"
}
```
{% endraw %}

## Validate the example

Save the example as `node.json` in the repository root, then run:

```bash
node -e "const { SHACLValidator } = require('./packages/robos-graph/lib/shacl-validator'); console.log(new SHACLValidator().validate([require('./node.json')]).conforms)"
```

The command prints `true` when the node meets every rule for its types.
