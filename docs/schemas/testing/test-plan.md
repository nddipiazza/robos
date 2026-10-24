---
title: Test Plan
layout: default
parent: "Testing, Quality & BDD (robos.testing)"
grand_parent: Schemas
nav_order: 19
permalink: /schemas/testing/test-plan.html
description: "Validation shape for robos:TestPlan nodes in the testing package group."
---

# robos:TestPlan
{: .no_toc }

Validation shape for `robos:TestPlan` nodes in the `testing` package group.
{: .fs-6 }

## Details

| | |
|---|---|
| Class | `robos:TestPlan` |
| Also matches | `oslc_qm:TestPlan` |
| Shape id | `urn:robos:shape:TestPlanShape` |
| Package | [Testing, Quality & BDD (robos.testing)]({{ '/schemas/testing.html' | relative_url }}) (`testing`) |
| Classification | Testing & behavior |
| Schema.org type | [`schema:Plan`](https://schema.org/Plan) |
| Domain standard | [OSLC QM](http://open-services.net/ns/qm#TestPlan) |

## Properties

Count is the minimum and maximum number of values (`*` means no maximum). The validator enforces both. The type column is documentation only; the validator does not check types.

| Property | Count | Type | Rule or description |
|---|---|---|---|
| `dcterms:title` | `1..*` | `xsd:string` | Test Plan must have a title. |

## Example node

This node comes from `.robos/kgraphs/testing/package.jsonld` in the RobOS repository. That graph holds sample data for a fictional company, so treat the values as illustrations.

{% raw %}
```json
{
  "@id": "urn:robos:test-plan:q3-release-regression",
  "@type": [
    "robos:TestPlan",
    "oslc_qm:TestPlan",
    "schema:Plan"
  ],
  "dcterms:title": "Q3 Release Acceptance & Regression Plan",
  "dcterms:description": "Quality gate test plan covering billing API transactions, contract verifications, and E2E checkout workflows.",
  "robos:testsService": "urn:robos:service:billing-api",
  "robos:package": "testing",
  "robos:namespace": "robos.testing",
  "robos:refersFrom": "http://open-services.net/ns/qm#TestPlan",
  "robos:schemaOrgType": "https://schema.org/Plan",
  "robos:domainStandard": "http://open-services.net/ns/qm#TestPlan"
}
```
{% endraw %}

## Validate the example

Save the example as `node.json` in the repository root, then run:

```bash
node -e "const { SHACLValidator } = require('./packages/robos-graph/lib/shacl-validator'); console.log(new SHACLValidator().validate([require('./node.json')]).conforms)"
```

The command prints `true` when the node meets every rule for its types.
