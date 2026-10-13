---
title: Scenario
layout: default
parent: "Testing, Quality & BDD (robos.testing)"
grand_parent: Schemas
nav_order: 1
permalink: /schemas/testing/scenario.html
---

# robos:Scenario
{: .no_toc }

Validation shape for `robos:Scenario` nodes in the `testing` package group.
{: .fs-6 }

## Details

| | |
|---|---|
| Class | `robos:Scenario` |
| Shape id | `urn:robos:shape:ScenarioShape` |
| Package | [Testing, Quality & BDD (robos.testing)]({{ '/schemas/testing.html' | relative_url }}) (`testing`) |
| Classification | Testing & behavior |
| Schema.org type | [`schema:CheckAction`](https://schema.org/CheckAction) |
| Domain standard | [OSLC QM](http://open-services.net/ns/qm#TestCase) |

## Properties

Count is the minimum and maximum number of values (`*` means no maximum). The validator enforces both. The type column is documentation only; the validator does not check types.

| Property | Count | Type | Rule or description |
|---|---|---|---|
| `dcterms:title` | `1..*` | `xsd:string` | Scenario must have a title. |
| `robos:steps` | `1..*` | `Array<robos:ScenarioStep>` | Scenario must define execution steps. |

## Example node

This node comes from `.robos/kgraphs/testing/package.jsonld` in the RobOS repository. That graph holds sample data for a fictional company, so treat the values as illustrations.

{% raw %}
```json
{
  "@id": "urn:robos:scenario:checkout-standard-items",
  "@type": [
    "robos:Scenario",
    "oslc_qm:TestCase",
    "schema:CheckAction"
  ],
  "dcterms:title": "Successful checkout with in-stock items",
  "dcterms:description": "Customer checks out with 2 items and successfully processes credit card payment.",
  "robos:inFeature": "urn:robos:gherkin:checkout-cart-validation",
  "robos:inRule": "urn:robos:gherkin:checkout-cart-validation:rule-inventory",
  "robos:steps": [
    "Given items SKU-101 and SKU-202 are in stock",
    "When the customer submits order with total $50",
    "Then order status is CONFIRMED"
  ],
  "robos:package": "testing",
  "robos:namespace": "robos.testing",
  "robos:refersFrom": "http://open-services.net/ns/qm#TestCase",
  "robos:schemaOrgType": "https://schema.org/CheckAction",
  "robos:domainStandard": "http://open-services.net/ns/qm#TestCase"
}
```
{% endraw %}

## Validate the example

Save the example as `node.json` in the repository root, then run:

```bash
node -e "const { SHACLValidator } = require('./packages/robos-graph/lib/shacl-validator'); console.log(new SHACLValidator().validate([require('./node.json')]).conforms)"
```

The command prints `true` when the node meets every rule for its types.
