---
title: Test Execution Record
layout: default
parent: "Testing, Quality & BDD (robos.testing)"
grand_parent: Schemas
nav_order: 21
permalink: /schemas/testing/test-execution-record.html
---

# robos:TestExecutionRecord
{: .no_toc }

Validation shape for `robos:TestExecutionRecord` nodes in the `testing` package group.
{: .fs-6 }

## Details

| | |
|---|---|
| Class | `robos:TestExecutionRecord` |
| Also matches | `oslc_qm:TestExecutionRecord` |
| Shape id | `urn:robos:shape:TestExecutionRecordShape` |
| Package | [Testing, Quality & BDD (robos.testing)]({{ '/schemas/testing.html' | relative_url }}) (`testing`) |
| Classification | Testing & behavior |
| Schema.org type | [`schema:AssessAction`](https://schema.org/AssessAction) |
| Domain standard | [OSLC QM](http://open-services.net/ns/qm#TestExecutionRecord) |

## Properties

Count is the minimum and maximum number of values (`*` means no maximum). The validator enforces both. The type column is documentation only; the validator does not check types.

| Property | Count | Type | Rule or description |
|---|---|---|---|
| `dcterms:title` | `1..*` | `xsd:string` | Test Execution Record must have a title. |
| `oslc_qm:executionStatus` | `1..*` | `xsd:string` | Test Execution Record must declare execution status (PASS, FAIL, BLOCKED, SKIPPED). |
| `oslc_qm:reportsOnTestCase` | `1..*` | `URI (robos:Scenario \| oslc_qm:TestCase)` | Test Execution Record must link to target test case or scenario. |

## Example node

This node comes from `.robos/kgraphs/testing/package.jsonld` in the RobOS repository. That graph holds sample data for a fictional company, so treat the values as illustrations.

{% raw %}
```json
{
  "@id": "urn:robos:test-exec:checkout-standard-items-latest",
  "@type": [
    "robos:TestExecutionRecord",
    "oslc_qm:TestExecutionRecord",
    "schema:AssessAction"
  ],
  "dcterms:title": "Latest Execution: Successful checkout with in-stock items",
  "oslc_qm:executionStatus": "PASS",
  "oslc_qm:reportsOnTestCase": "urn:robos:scenario:checkout-standard-items",
  "robos:testFramework": "cucumber",
  "robos:durationMs": 420,
  "robos:executedAt": "2026-09-08T12:00:00Z",
  "robos:inTestSuite": "urn:robos:test-suite:billing-api-bdd",
  "robos:package": "testing",
  "robos:namespace": "robos.testing",
  "robos:refersFrom": "http://open-services.net/ns/qm#TestExecutionRecord",
  "robos:schemaOrgType": "https://schema.org/AssessAction",
  "robos:domainStandard": "http://open-services.net/ns/qm#TestExecutionRecord"
}
```
{% endraw %}

## Validate the example

Save the example as `node.json` in the repository root, then run:

```bash
node -e "const { SHACLValidator } = require('./packages/robos-graph/lib/shacl-validator'); console.log(new SHACLValidator().validate([require('./node.json')]).conforms)"
```

The command prints `true` when the node meets every rule for its types.
