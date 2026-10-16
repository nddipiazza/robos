---
title: Test Suite
layout: default
parent: "Testing, Quality & BDD (robos.testing)"
grand_parent: Schemas
nav_order: 20
permalink: /schemas/testing/test-suite.html
---

# robos:TestSuite
{: .no_toc }

Validation shape for `robos:TestSuite` nodes in the `testing` package group.
{: .fs-6 }

## Details

| | |
|---|---|
| Class | `robos:TestSuite` |
| Also matches | `oslc_qm:TestSuite` |
| Shape id | `urn:robos:shape:TestSuiteShape` |
| Package | [Testing, Quality & BDD (robos.testing)]({{ '/schemas/testing.html' | relative_url }}) (`testing`) |
| Classification | Testing & behavior |
| Schema.org type | [`schema:ItemList`](https://schema.org/ItemList) |
| Domain standard | [OSLC QM](http://open-services.net/ns/qm#TestSuite) |

## Properties

Count is the minimum and maximum number of values (`*` means no maximum). The validator enforces both. The type column is documentation only; the validator does not check types.

| Property | Count | Type | Rule or description |
|---|---|---|---|
| `dcterms:title` | `1..*` | `xsd:string` | Test Suite must have a title. |
| `robos:testFramework` | `1..*` | `xsd:string` | Test Suite must specify testing framework or runner. |

## Example node

This node comes from `.robos/kgraphs/testing/package.jsonld` in the RobOS repository. That graph holds sample data for a fictional company, so treat the values as illustrations.

{% raw %}
```json
{
  "@id": "urn:robos:test-suite:billing-api-bdd",
  "@type": [
    "robos:TestSuite",
    "oslc_qm:TestSuite",
    "schema:ItemList"
  ],
  "dcterms:title": "Billing API Cucumber BDD Test Suite",
  "dcterms:description": "Automated Cucumber test suite running BDD acceptance scenarios against billing API staging cluster.",
  "robos:testFramework": "cucumber",
  "robos:inTestPlan": "urn:robos:test-plan:q3-release-regression",
  "robos:package": "testing",
  "robos:namespace": "robos.testing",
  "robos:refersFrom": "http://open-services.net/ns/qm#TestSuite",
  "robos:schemaOrgType": "https://schema.org/ItemList",
  "robos:domainStandard": "http://open-services.net/ns/qm#TestSuite",
  "robos:testsService": "urn:robos:service:billing-api",
  "robos:testingType": "BDD Acceptance"
}
```
{% endraw %}

## Validate the example

Save the example as `node.json` in the repository root, then run:

```bash
node -e "const { SHACLValidator } = require('./packages/robos-graph/lib/shacl-validator'); console.log(new SHACLValidator().validate([require('./node.json')]).conforms)"
```

The command prints `true` when the node meets every rule for its types.
