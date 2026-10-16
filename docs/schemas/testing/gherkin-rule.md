---
title: Gherkin Rule
layout: default
parent: "Testing, Quality & BDD (robos.testing)"
grand_parent: Schemas
nav_order: 12
permalink: /schemas/testing/gherkin-rule.html
---

# robos:GherkinRule
{: .no_toc }

Validation shape for `robos:GherkinRule` nodes in the `testing` package group.
{: .fs-6 }

## Details

| | |
|---|---|
| Class | `robos:GherkinRule` |
| Also matches | `robos:Rule` |
| Shape id | `urn:robos:shape:GherkinRuleShape` |
| Package | [Testing, Quality & BDD (robos.testing)]({{ '/schemas/testing.html' | relative_url }}) (`testing`) |
| Classification | Testing & behavior |
| Schema.org type | [`schema:DigitalDocument`](https://schema.org/DigitalDocument) |
| Domain standard | [Cucumber](https://cucumber.io/docs/gherkin/reference/#rule) |

## Properties

Count is the minimum and maximum number of values (`*` means no maximum). The validator enforces both. The type column is documentation only; the validator does not check types.

| Property | Count | Type | Rule or description |
|---|---|---|---|
| `dcterms:title` | `1..*` | `xsd:string` | Gherkin Rule must have a title. |
| `robos:inFeature` | `1..*` | - | Gherkin Rule must link to parent Gherkin feature. |

## Example node

This node comes from `.robos/kgraphs/testing/package.jsonld` in the RobOS repository. That graph holds sample data for a fictional company, so treat the values as illustrations.

{% raw %}
```json
{
  "@id": "urn:robos:gherkin:checkout-cart-validation:rule-inventory",
  "@type": [
    "robos:GherkinRule",
    "robos:Rule",
    "schema:DigitalDocument"
  ],
  "dcterms:title": "Rule: Inventory must be verified before payment processing",
  "dcterms:description": "Transactions fail early if any cart item quantity exceeds available stock warehouse ledger.",
  "robos:inFeature": "urn:robos:gherkin:checkout-cart-validation",
  "robos:package": "testing",
  "robos:namespace": "robos.testing",
  "robos:refersFrom": "https://cucumber.io/docs/gherkin/reference/#rule",
  "robos:schemaOrgType": "https://schema.org/DigitalDocument",
  "robos:domainStandard": "https://cucumber.io/docs/gherkin/reference/#rule"
}
```
{% endraw %}

## Validate the example

Save the example as `node.json` in the repository root, then run:

```bash
node -e "const { SHACLValidator } = require('./packages/robos-graph/lib/shacl-validator'); console.log(new SHACLValidator().validate([require('./node.json')]).conforms)"
```

The command prints `true` when the node meets every rule for its types.
