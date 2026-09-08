---
title: Gherkin Feature
layout: default
parent: Testing, Quality & BDD (robos.testing)
grand_parent: KGraph Schemas
nav_order: 3
permalink: /schemas/testing/gherkin-feature.html
---

# Schema: `robos:GherkinFeature`
{: .no_toc }

Formal W3C SHACL constraint shape and OSLC JSON-LD specification for `robos:GherkinFeature` in the `testing` package store.
{: .fs-6 .fw-300 }

## Table of contents
{: .no_toc .text-delta }

1. TOC
{:toc}

---

## Specification Metadata

- **RDF / OWL Class**: `robos:GherkinFeature`
- **Aliases / Target Classes**: `robos:GherkinFeature`, `robos:BDDFeature`
- **SHACL Shape ID**: `urn:robos:shape:GherkinFeatureShape`
- **Governing Package**: [Testing, Quality & BDD (robos.testing)]({{ '/schemas/testing.html' | relative_url }}) (`testing`)
- **Namespace**: `robos.testing`
- **Upstream Schema Basis (Refers From)**: [http://open-services.net/ns/rm#Requirement](http://open-services.net/ns/rm#Requirement)

---

## Upstream Schema Basis (Refers From)

This RobOS schema is modeled after and directly expands upon the upstream canonical standard:
- **Canonical Reference**: [http://open-services.net/ns/rm#Requirement](http://open-services.net/ns/rm#Requirement)
- **Provenance & Alignment**: When autonomous agents generate, expand, or validate instances of `robos:GherkinFeature`, they MUST adhere to and base their output on this referred schema object, extending it with RobOS SDLC properties.

---

## Entity Relationship & Schema Context

<div style="margin: 1.5rem 0; padding: 1.25rem; background: #161b22; border: 1px solid #30363d; border-radius: 8px;">
  <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.75rem; flex-wrap: wrap; gap: 0.5rem;">
    <span style="font-size: 1.15rem; font-weight: 700; color: #38bdf8;">Gherkin Feature</span>
    <span style="font-family: monospace; background: #121927; color: #00e5ff; border: 1px solid rgba(0, 229, 255, 0.4); padding: 0.2rem 0.6rem; border-radius: 6px; font-size: 0.85rem;">robos:GherkinFeature</span>
  </div>
  <p style="margin-bottom: 0.75rem; font-size: 0.92rem; color: #c9d1d9;">Governed by W3C SHACL shape <code>urn:robos:shape:GherkinFeatureShape</code> within the <strong>Testing, Quality & BDD (robos.testing)</strong> (<code>robos.testing</code>) package store.</p>
  <div style="display: flex; flex-wrap: wrap; gap: 0.5rem; margin-top: 0.5rem;">
    <span style="background: #0d1117; border: 1px solid #21262d; padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.8rem; color: #8b949e;"><code>dcterms:title</code></span>
    <span style="background: #0d1117; border: 1px solid #21262d; padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.8rem; color: #8b949e;"><code>robos:featureFile</code></span>
  </div>
</div>

---

## Property Constraints & SHACL Rules

| Property Path | Name | Multiplicity | Data Type | Constraint Rule / Validation Message |
|---|---|---|---|---|
| **`dcterms:title`** | Title / Display Name | `1..*` | `xsd:string` | Gherkin Feature must have a title. |
| **`robos:featureFile`** | Gherkin Feature File | `1..*` | `xsd:string` | Gherkin Feature must link to a .feature file. |

---

## Canonical OSLC JSON-LD Example

```json
{
  "@id": "urn:robos:gherkin:checkout-cart-validation",
  "@type": [
    "robos:GherkinFeature",
    "robos:BDDFeature",
    "oslc_rm:Requirement"
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
  "robos:refersFrom": "http://open-services.net/ns/rm#Requirement"
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
        "@id": "urn:robos:gherkin:checkout-cart-validation",
        "@type": [
            "robos:GherkinFeature",
            "robos:BDDFeature",
            "oslc_rm:Requirement"
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
        "robos:refersFrom": "http://open-services.net/ns/rm#Requirement"
    }
  ],
}));

console.log("Conforms:", result.conforms); // Expected: true
```