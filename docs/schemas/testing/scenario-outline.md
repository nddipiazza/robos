---
title: Scenario Outline
layout: default
parent: Testing, Quality & BDD (robos.testing)
grand_parent: KGraph Schemas
nav_order: 6
permalink: /schemas/testing/scenario-outline.html
---

# Schema: `robos:ScenarioOutline`
{: .no_toc }

Formal W3C SHACL constraint shape and OSLC JSON-LD specification for `robos:ScenarioOutline` in the `testing` package store.
{: .fs-6 .fw-300 }

## Table of contents
{: .no_toc .text-delta }

1. TOC
{:toc}

---

## Specification Metadata

- **RDF / OWL Class**: `robos:ScenarioOutline`
- **Aliases / Target Classes**: `robos:ScenarioOutline`
- **SHACL Shape ID**: `urn:robos:shape:ScenarioOutlineShape`
- **Governing Package**: [Testing, Quality & BDD (robos.testing)]({{ '/schemas/testing.html' | relative_url }}) (`testing`)
- **Namespace**: `robos.testing`
- **Schema.org Classification**: [https://schema.org/CheckAction](https://schema.org/CheckAction)
- **Domain De Facto Standard**: [https://cucumber.io/docs/gherkin/reference/#scenario-outline](https://cucumber.io/docs/gherkin/reference/#scenario-outline)
- **Upstream Schema Basis (Refers From)**: [https://cucumber.io/docs/gherkin/reference/#scenario-outline](https://cucumber.io/docs/gherkin/reference/#scenario-outline)

---

## Upstream Schema Basis (Refers From) & Global Standards Provenance

This RobOS schema is modeled after and directly aligns with two levels of global standards:
- **Universal Schema.org Class**: [https://schema.org/CheckAction](https://schema.org/CheckAction) (100% interoperability with search engines, web indexers, and general AI reasoning)
- **Specialized Domain Standard**: [https://cucumber.io/docs/gherkin/reference/#scenario-outline](https://cucumber.io/docs/gherkin/reference/#scenario-outline) (de facto standard for domain-specific ALM, BDD, or infrastructure operations)
- **Canonical Reference**: [https://cucumber.io/docs/gherkin/reference/#scenario-outline](https://cucumber.io/docs/gherkin/reference/#scenario-outline)
- **Agent Guidelines**: When autonomous agents generate, expand, or validate instances of `robos:ScenarioOutline`, they MUST adhere to and base their output on this referred schema object and universal Schema.org parent class, extending it with RobOS SDLC properties.

---

## Entity Relationship & Schema Context

<div style="margin: 1.5rem 0; padding: 1.25rem; background: #161b22; border: 1px solid #30363d; border-radius: 8px;">
  <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.75rem; flex-wrap: wrap; gap: 0.5rem;">
    <span style="font-size: 1.15rem; font-weight: 700; color: #38bdf8;">Scenario Outline</span>
    <span style="font-family: monospace; background: #121927; color: #00e5ff; border: 1px solid rgba(0, 229, 255, 0.4); padding: 0.2rem 0.6rem; border-radius: 6px; font-size: 0.85rem;">robos:ScenarioOutline</span>
  </div>
  <p style="margin-bottom: 0.75rem; font-size: 0.92rem; color: #c9d1d9;">Governed by W3C SHACL shape <code>urn:robos:shape:ScenarioOutlineShape</code> within the <strong>Testing, Quality & BDD (robos.testing)</strong> (<code>robos.testing</code>) package store.</p>
  <div style="display: flex; flex-wrap: wrap; gap: 0.5rem; margin-top: 0.5rem;">
    <span style="background: #0d1117; border: 1px solid #21262d; padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.8rem; color: #8b949e;"><code>dcterms:title</code></span>
    <span style="background: #0d1117; border: 1px solid #21262d; padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.8rem; color: #8b949e;"><code>robos:steps</code></span>
    <span style="background: #0d1117; border: 1px solid #21262d; padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.8rem; color: #8b949e;"><code>robos:examplesTable</code></span>
  </div>
</div>

---

## Property Constraints & SHACL Rules

| Property Path | Name | Multiplicity | Data Type | Constraint Rule / Validation Message |
|---|---|---|---|---|
| **`dcterms:title`** | Title / Display Name | `1..*` | `xsd:string` | Scenario Outline must have a title. |
| **`robos:steps`** | Scenario Steps | `1..*` | `Array<robos:ScenarioStep>` | Scenario Outline must define template execution steps. |
| **`robos:examplesTable`** | Examples Table | `1..*` | `URI (robos:ExamplesTable)` | Scenario Outline must link to an Examples table. |

---

## Canonical OSLC JSON-LD Example

```json
{
  "@id": "urn:robos:scenario-outline:checkout-discount-tiers",
  "@type": [
    "robos:ScenarioOutline",
    "oslc_qm:TestCase",
    "schema:CheckAction"
  ],
  "dcterms:title": "Discount tier calculation for loyalty members",
  "dcterms:description": "Parameterized verification of discount percentages by customer loyalty membership level.",
  "robos:inFeature": "urn:robos:gherkin:checkout-cart-validation",
  "robos:steps": [
    "Given customer loyalty tier is <tier>",
    "When order subtotal is <amount>",
    "Then calculated discount is <discount>"
  ],
  "robos:examplesTable": "urn:robos:examples:checkout-loyalty-tiers",
  "robos:package": "testing",
  "robos:namespace": "robos.testing",
  "robos:refersFrom": "https://cucumber.io/docs/gherkin/reference/#scenario-outline",
  "robos:schemaOrgType": "https://schema.org/CheckAction",
  "robos:domainStandard": "https://cucumber.io/docs/gherkin/reference/#scenario-outline"
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
        "@id": "urn:robos:scenario-outline:checkout-discount-tiers",
        "@type": [
            "robos:ScenarioOutline",
            "oslc_qm:TestCase",
            "schema:CheckAction"
        ],
        "dcterms:title": "Discount tier calculation for loyalty members",
        "dcterms:description": "Parameterized verification of discount percentages by customer loyalty membership level.",
        "robos:inFeature": "urn:robos:gherkin:checkout-cart-validation",
        "robos:steps": [
            "Given customer loyalty tier is <tier>",
            "When order subtotal is <amount>",
            "Then calculated discount is <discount>"
        ],
        "robos:examplesTable": "urn:robos:examples:checkout-loyalty-tiers",
        "robos:package": "testing",
        "robos:namespace": "robos.testing",
        "robos:refersFrom": "https://cucumber.io/docs/gherkin/reference/#scenario-outline",
        "robos:schemaOrgType": "https://schema.org/CheckAction",
        "robos:domainStandard": "https://cucumber.io/docs/gherkin/reference/#scenario-outline"
    }
  ],
}));

console.log("Conforms:", result.conforms); // Expected: true
```