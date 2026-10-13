---
title: Gherkin Feature
layout: default
parent: "Testing & BDD"
grand_parent: Schemas
nav_order: 10
permalink: /schemas/testing/gherkin-feature.html
---

# robos:GherkinFeature
{: .no_toc }

Validation shape for `robos:GherkinFeature` nodes in the `testing` package group.
{: .fs-6 }

## Details

| Detail | Value |
|---|---|
| Class | `robos:GherkinFeature` |
| Also matches | `robos:BDDFeature` |
| Shape id | `urn:robos:shape:GherkinFeatureShape` |
| Package | [Testing & BDD]({{ '/schemas/testing.html' | relative_url }}) (`testing`) |
| Classification | Testing & behavior |
| Schema.org type | [`schema:DigitalDocument`](https://schema.org/DigitalDocument) |
| Domain standard | [OSLC RM](http://open-services.net/ns/rm#Requirement) |

## Properties

Count is the minimum and maximum number of values (`*` means no maximum). The validator enforces both. The type column is documentation only; the validator does not check types.

| Property | Count | Type | Rule or description |
|---|---|---|---|
| `dcterms:title` | `1..*` | `xsd:string` | Gherkin Feature must have a title. |
| `robos:featureFile` | `1..*` | `xsd:string` | Gherkin Feature must link to a .feature file. |

## Example node

This node comes from `.robos/kgraphs/testing/package.jsonld` in the RobOS repository. That graph holds sample data for a fictional company, so treat the values as illustrations.

{% raw %}
```json
{
  "@id": "urn:robos:gherkin:checkout-cart-validation",
  "@type": [
    "robos:GherkinFeature",
    "robos:BDDFeature",
    "oslc_rm:Requirement",
    "schema:DigitalDocument"
  ],
  "dcterms:title": "E-Commerce Checkout & Cart Validation",
  "dcterms:description": "Acceptance criteria validating transactional shopping cart checkout, inventory reservation, and payment processing.",
  "robos:featureFile": "features/checkout.feature",
  "robos:testsService": "urn:robos:service:billing-api",
  "robos:hasBackground": "urn:robos:gherkin:checkout-cart-validation:background",
  "robos:hasRule": [
    "urn:robos:gherkin:checkout-cart-validation:rule-inventory"
  ],
  "robos:hasScenario": [
    "urn:robos:scenario:checkout-standard-items"
  ],
  "robos:hasScenarioOutline": [
    "urn:robos:scenario-outline:checkout-discount-tiers"
  ],
  "robos:tags": [
    "checkout",
    "billing",
    "regression"
  ],
  "robos:package": "testing",
  "robos:namespace": "robos.testing",
  "robos:refersFrom": "http://open-services.net/ns/rm#Requirement",
  "robos:schemaOrgType": "https://schema.org/DigitalDocument",
  "robos:domainStandard": "http://open-services.net/ns/rm#Requirement"
}
```
{% endraw %}

## Validate the example

Save the example as `node.json` in the repository root, then run:

```bash
node -e "const { SHACLValidator } = require('./packages/robos-graph/lib/shacl-validator'); console.log(new SHACLValidator().validate([require('./node.json')]).conforms)"
```

The command prints `true` when the node meets every rule for its types.
