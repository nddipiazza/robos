---
title: Test Execution Record
layout: default
parent: Testing, Quality & BDD (robos.testing)
grand_parent: KGraph Schemas
nav_order: 14
permalink: /schemas/testing/test-execution-record.html
---

# Schema: `robos:TestExecutionRecord`
{: .no_toc }

Formal W3C SHACL constraint shape and OSLC JSON-LD specification for `robos:TestExecutionRecord` in the `testing` package store.
{: .fs-6 .fw-300 }

## Table of contents
{: .no_toc .text-delta }

1. TOC
{:toc}

---

## Specification Metadata

- **RDF / OWL Class**: `robos:TestExecutionRecord`
- **Aliases / Target Classes**: `robos:TestExecutionRecord`, `oslc_qm:TestExecutionRecord`
- **SHACL Shape ID**: `urn:robos:shape:TestExecutionRecordShape`
- **Governing Package**: [Testing, Quality & BDD (robos.testing)]({{ '/schemas/testing.html' | relative_url }}) (`testing`)
- **Namespace**: `robos.testing`
- **Schema.org Classification**: [https://schema.org/AssessAction](https://schema.org/AssessAction)
- **Domain De Facto Standard**: [http://open-services.net/ns/qm#TestExecutionRecord](http://open-services.net/ns/qm#TestExecutionRecord)
- **Upstream Schema Basis (Refers From)**: [http://open-services.net/ns/qm#TestExecutionRecord](http://open-services.net/ns/qm#TestExecutionRecord)

---

## Upstream Schema Basis (Refers From) & Global Standards Provenance

This RobOS schema is modeled after and directly aligns with two levels of global standards:
- **Universal Schema.org Class**: [https://schema.org/AssessAction](https://schema.org/AssessAction) (100% interoperability with search engines, web indexers, and general AI reasoning)
- **Specialized Domain Standard**: [http://open-services.net/ns/qm#TestExecutionRecord](http://open-services.net/ns/qm#TestExecutionRecord) (de facto standard for domain-specific ALM, BDD, or infrastructure operations)
- **Canonical Reference**: [http://open-services.net/ns/qm#TestExecutionRecord](http://open-services.net/ns/qm#TestExecutionRecord)
- **Agent Guidelines**: When autonomous agents generate, expand, or validate instances of `robos:TestExecutionRecord`, they MUST adhere to and base their output on this referred schema object and universal Schema.org parent class, extending it with RobOS SDLC properties.

---

## Entity Relationship & Schema Context

<div style="margin: 1.5rem 0; padding: 1.25rem; background: #161b22; border: 1px solid #30363d; border-radius: 8px;">
  <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.75rem; flex-wrap: wrap; gap: 0.5rem;">
    <span style="font-size: 1.15rem; font-weight: 700; color: #38bdf8;">Test Execution Record</span>
    <span style="font-family: monospace; background: #121927; color: #00e5ff; border: 1px solid rgba(0, 229, 255, 0.4); padding: 0.2rem 0.6rem; border-radius: 6px; font-size: 0.85rem;">robos:TestExecutionRecord</span>
  </div>
  <p style="margin-bottom: 0.75rem; font-size: 0.92rem; color: #c9d1d9;">Governed by W3C SHACL shape <code>urn:robos:shape:TestExecutionRecordShape</code> within the <strong>Testing, Quality & BDD (robos.testing)</strong> (<code>robos.testing</code>) package store.</p>
  <div style="display: flex; flex-wrap: wrap; gap: 0.5rem; margin-top: 0.5rem;">
    <span style="background: #0d1117; border: 1px solid #21262d; padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.8rem; color: #8b949e;"><code>dcterms:title</code></span>
    <span style="background: #0d1117; border: 1px solid #21262d; padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.8rem; color: #8b949e;"><code>oslc_qm:executionStatus</code></span>
    <span style="background: #0d1117; border: 1px solid #21262d; padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.8rem; color: #8b949e;"><code>oslc_qm:reportsOnTestCase</code></span>
  </div>
</div>

---

## Property Constraints & SHACL Rules

| Property Path | Name | Multiplicity | Data Type | Constraint Rule / Validation Message |
|---|---|---|---|---|
| **`dcterms:title`** | Title / Display Name | `1..*` | `xsd:string` | Test Execution Record must have a title. |
| **`oslc_qm:executionStatus`** | Execution Status | `1..*` | `xsd:string` | Test Execution Record must declare execution status (PASS, FAIL, BLOCKED, SKIPPED). |
| **`oslc_qm:reportsOnTestCase`** | Reports On Test Case | `1..*` | `URI (robos:Scenario | oslc_qm:TestCase)` | Test Execution Record must link to target test case or scenario. |

---

## Canonical OSLC JSON-LD Example

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

---

## Programmatic SHACL Validation

```javascript
const { SHACLValidator } = require('/usr/local/share/robos/robos-graph/lib/shacl-validator');
const { OSLCGraphParser, OSLC_CONTEXT } = require('/usr/local/share/robos/robos-graph/lib/oslc-parser');

const validator = new SHACLValidator();
const result = validator.validateGraph(new OSLCGraphParser({
  "@context": OSLC_CONTEXT,
  "robos:nodes": [
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
  ],
}));

console.log("Conforms:", result.conforms); // Expected: true
```