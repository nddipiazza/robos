---
title: Test Plan
layout: default
parent: Testing, Quality & BDD (robos.testing)
grand_parent: KGraph Schemas
nav_order: 12
permalink: /schemas/testing/test-plan.html
---

# Schema: `robos:TestPlan`
{: .no_toc }

Formal W3C SHACL constraint shape and OSLC JSON-LD specification for `robos:TestPlan` in the `testing` package store.
{: .fs-6 .fw-300 }

## Table of contents
{: .no_toc .text-delta }

1. TOC
{:toc}

---

## Specification Metadata

- **RDF / OWL Class**: `robos:TestPlan`
- **Aliases / Target Classes**: `robos:TestPlan`, `oslc_qm:TestPlan`
- **SHACL Shape ID**: `urn:robos:shape:TestPlanShape`
- **Governing Package**: [Testing, Quality & BDD (robos.testing)]({{ '/schemas/testing.html' | relative_url }}) (`testing`)
- **Namespace**: `robos.testing`
- **Upstream Schema Basis (Refers From)**: [http://open-services.net/ns/qm#TestPlan](http://open-services.net/ns/qm#TestPlan)

---

## Upstream Schema Basis (Refers From)

This RobOS schema is modeled after and directly expands upon the upstream canonical standard:
- **Canonical Reference**: [http://open-services.net/ns/qm#TestPlan](http://open-services.net/ns/qm#TestPlan)
- **Provenance & Alignment**: When autonomous agents generate, expand, or validate instances of `robos:TestPlan`, they MUST adhere to and base their output on this referred schema object, extending it with RobOS SDLC properties.

---

## Entity Relationship & Schema Context

<div style="margin: 1.5rem 0; padding: 1.25rem; background: #161b22; border: 1px solid #30363d; border-radius: 8px;">
  <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.75rem; flex-wrap: wrap; gap: 0.5rem;">
    <span style="font-size: 1.15rem; font-weight: 700; color: #38bdf8;">Test Plan</span>
    <span style="font-family: monospace; background: #121927; color: #00e5ff; border: 1px solid rgba(0, 229, 255, 0.4); padding: 0.2rem 0.6rem; border-radius: 6px; font-size: 0.85rem;">robos:TestPlan</span>
  </div>
  <p style="margin-bottom: 0.75rem; font-size: 0.92rem; color: #c9d1d9;">Governed by W3C SHACL shape <code>urn:robos:shape:TestPlanShape</code> within the <strong>Testing, Quality & BDD (robos.testing)</strong> (<code>robos.testing</code>) package store.</p>
  <div style="display: flex; flex-wrap: wrap; gap: 0.5rem; margin-top: 0.5rem;">
    <span style="background: #0d1117; border: 1px solid #21262d; padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.8rem; color: #8b949e;"><code>dcterms:title</code></span>
  </div>
</div>

---

## Property Constraints & SHACL Rules

| Property Path | Name | Multiplicity | Data Type | Constraint Rule / Validation Message |
|---|---|---|---|---|
| **`dcterms:title`** | Title / Display Name | `1..*` | `xsd:string` | Test Plan must have a title. |

---

## Canonical OSLC JSON-LD Example

```json
{
  "@id": "urn:robos:test-plan:q3-release-regression",
  "@type": [
    "robos:TestPlan",
    "oslc_qm:TestPlan"
  ],
  "dcterms:title": "Q3 Release Acceptance & Regression Plan",
  "dcterms:description": "Quality gate test plan covering billing API transactions, contract verifications, and E2E checkout workflows.",
  "robos:testsService": "urn:robos:service:billing-api",
  "robos:package": "testing",
  "robos:namespace": "robos.testing",
  "robos:refersFrom": "http://open-services.net/ns/qm#TestPlan"
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
        "@id": "urn:robos:test-plan:q3-release-regression",
        "@type": [
            "robos:TestPlan",
            "oslc_qm:TestPlan"
        ],
        "dcterms:title": "Q3 Release Acceptance & Regression Plan",
        "dcterms:description": "Quality gate test plan covering billing API transactions, contract verifications, and E2E checkout workflows.",
        "robos:testsService": "urn:robos:service:billing-api",
        "robos:package": "testing",
        "robos:namespace": "robos.testing",
        "robos:refersFrom": "http://open-services.net/ns/qm#TestPlan"
    }
  ],
}));

console.log("Conforms:", result.conforms); // Expected: true
```