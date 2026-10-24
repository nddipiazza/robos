---
title: Gherkin Background
layout: default
parent: "Testing, Quality & BDD (robos.testing)"
grand_parent: Schemas
nav_order: 11
permalink: /schemas/testing/gherkin-background.html
description: "Validation shape for robos:GherkinBackground nodes in the testing package group."
---

# robos:GherkinBackground
{: .no_toc }

Validation shape for `robos:GherkinBackground` nodes in the `testing` package group.
{: .fs-6 }

## Details

| | |
|---|---|
| Class | `robos:GherkinBackground` |
| Also matches | `robos:Background` |
| Shape id | `urn:robos:shape:GherkinBackgroundShape` |
| Package | [Testing, Quality & BDD (robos.testing)]({{ '/schemas/testing.html' | relative_url }}) (`testing`) |
| Classification | Testing & behavior |
| Schema.org type | [`schema:ItemList`](https://schema.org/ItemList) |
| Domain standard | [Cucumber](https://cucumber.io/docs/gherkin/reference/#background) |

## Properties

Count is the minimum and maximum number of values (`*` means no maximum). The validator enforces both. The type column is documentation only; the validator does not check types.

| Property | Count | Type | Rule or description |
|---|---|---|---|
| `dcterms:title` | `1..*` | `xsd:string` | Gherkin Background must have a title. |
| `robos:steps` | `1..*` | `Array<robos:ScenarioStep>` | Gherkin Background must define prerequisite steps. |
| `robos:inFeature` | `1..*` | - | Gherkin Background must link to parent Gherkin feature. |

## Example node

This node comes from `.robos/kgraphs/testing/package.jsonld` in the RobOS repository. That graph holds sample data for a fictional company, so treat the values as illustrations.

{% raw %}
```json
{
  "@id": "urn:robos:gherkin:checkout-cart-validation:background",
  "@type": [
    "robos:GherkinBackground",
    "robos:Background",
    "schema:ItemList"
  ],
  "dcterms:title": "Customer Session & Cart Initialization",
  "robos:steps": [
    "Given the customer is logged in with valid token",
    "And the shopping cart is initialized"
  ],
  "robos:inFeature": "urn:robos:gherkin:checkout-cart-validation",
  "robos:package": "testing",
  "robos:namespace": "robos.testing",
  "robos:refersFrom": "https://cucumber.io/docs/gherkin/reference/#background",
  "robos:schemaOrgType": "https://schema.org/ItemList",
  "robos:domainStandard": "https://cucumber.io/docs/gherkin/reference/#background"
}
```
{% endraw %}

## Validate the example

Save the example as `node.json` in the repository root, then run:

```bash
node -e "const { SHACLValidator } = require('./packages/robos-graph/lib/shacl-validator'); console.log(new SHACLValidator().validate([require('./node.json')]).conforms)"
```

The command prints `true` when the node meets every rule for its types.
