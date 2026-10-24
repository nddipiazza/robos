---
title: Step Definition
layout: default
parent: "Testing, Quality & BDD (robos.testing)"
grand_parent: Schemas
nav_order: 15
permalink: /schemas/testing/step-definition.html
description: "Validation shape for robos:StepDefinition nodes in the testing package group."
---

# robos:StepDefinition
{: .no_toc }

Validation shape for `robos:StepDefinition` nodes in the `testing` package group.
{: .fs-6 }

## Details

| | |
|---|---|
| Class | `robos:StepDefinition` |
| Shape id | `urn:robos:shape:StepDefinitionShape` |
| Package | [Testing, Quality & BDD (robos.testing)]({{ '/schemas/testing.html' | relative_url }}) (`testing`) |
| Classification | Testing & behavior |
| Schema.org type | [`schema:SoftwareSourceCode`](https://schema.org/SoftwareSourceCode) |
| Domain standard | [Cucumber](https://cucumber.io/docs/cucumber/step-definitions/) |

## Properties

Count is the minimum and maximum number of values (`*` means no maximum). The validator enforces both. The type column is documentation only; the validator does not check types.

| Property | Count | Type | Rule or description |
|---|---|---|---|
| `dcterms:title` | `1..*` | `xsd:string` | Step Definition must have a title. |
| `robos:regexPattern` | `1..*` | `xsd:string` | Step Definition must specify matching regex expression. |
| `robos:codeFile` | `1..*` | `xsd:string` | Step Definition must link to implementation source file. |

## Example node

This node comes from `.robos/kgraphs/testing/package.jsonld` in the RobOS repository. That graph holds sample data for a fictional company, so treat the values as illustrations.

{% raw %}
```json
{
  "@id": "urn:robos:stepdef:customer-submits-order",
  "@type": [
    "robos:StepDefinition",
    "schema:SoftwareSourceCode"
  ],
  "dcterms:title": "StepDef: Customer Submits Order",
  "robos:regexPattern": "^the customer submits order with total \\$(\\d+)$",
  "robos:codeFile": "tests/steps/checkout_steps.js",
  "robos:functionName": "submitOrderStep",
  "robos:package": "testing",
  "robos:namespace": "robos.testing",
  "robos:refersFrom": "https://cucumber.io/docs/cucumber/step-definitions/",
  "robos:schemaOrgType": "https://schema.org/SoftwareSourceCode",
  "robos:domainStandard": "https://cucumber.io/docs/cucumber/step-definitions/"
}
```
{% endraw %}

## Validate the example

Save the example as `node.json` in the repository root, then run:

```bash
node -e "const { SHACLValidator } = require('./packages/robos-graph/lib/shacl-validator'); console.log(new SHACLValidator().validate([require('./node.json')]).conforms)"
```

The command prints `true` when the node meets every rule for its types.
