---
title: Gherkin Background
layout: default
parent: Testing, Quality & BDD (robos.testing)
grand_parent: KGraph Schemas
nav_order: 4
permalink: /schemas/testing/gherkin-background.html
---

# Schema: `robos:GherkinBackground`
{: .no_toc }

Formal W3C SHACL constraint shape and OSLC JSON-LD specification for `robos:GherkinBackground` in the `testing` package store.
{: .fs-6 .fw-300 }

## Table of contents
{: .no_toc .text-delta }

1. TOC
{:toc}

---

## Specification Metadata

- **RDF / OWL Class**: `robos:GherkinBackground`
- **Aliases / Target Classes**: `robos:GherkinBackground`, `robos:Background`
- **SHACL Shape ID**: `urn:robos:shape:GherkinBackgroundShape`
- **Governing Package**: [Testing, Quality & BDD (robos.testing)]({{ '/schemas/testing.html' | relative_url }}) (`testing`)
- **Namespace**: `robos.testing`
- **Schema.org Classification**: [https://schema.org/ItemList](https://schema.org/ItemList)
- **Domain De Facto Standard**: [https://cucumber.io/docs/gherkin/reference/#background](https://cucumber.io/docs/gherkin/reference/#background)
- **Upstream Schema Basis (Refers From)**: [https://cucumber.io/docs/gherkin/reference/#background](https://cucumber.io/docs/gherkin/reference/#background)

---

## Upstream Schema Basis (Refers From) & Global Standards Provenance

This RobOS schema is modeled after and directly aligns with two levels of global standards:
- **Universal Schema.org Class**: [https://schema.org/ItemList](https://schema.org/ItemList) (100% interoperability with search engines, web indexers, and general AI reasoning)
- **Specialized Domain Standard**: [https://cucumber.io/docs/gherkin/reference/#background](https://cucumber.io/docs/gherkin/reference/#background) (de facto standard for domain-specific ALM, BDD, or infrastructure operations)
- **Canonical Reference**: [https://cucumber.io/docs/gherkin/reference/#background](https://cucumber.io/docs/gherkin/reference/#background)
- **Agent Guidelines**: When autonomous agents generate, expand, or validate instances of `robos:GherkinBackground`, they MUST adhere to and base their output on this referred schema object and universal Schema.org parent class, extending it with RobOS SDLC properties.

---

## Entity Relationship & Schema Context

<div style="margin: 1.5rem 0; padding: 1.25rem; background: #161b22; border: 1px solid #30363d; border-radius: 8px;">
  <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.75rem; flex-wrap: wrap; gap: 0.5rem;">
    <span style="font-size: 1.15rem; font-weight: 700; color: #38bdf8;">Gherkin Background</span>
    <span style="font-family: monospace; background: #121927; color: #00e5ff; border: 1px solid rgba(0, 229, 255, 0.4); padding: 0.2rem 0.6rem; border-radius: 6px; font-size: 0.85rem;">robos:GherkinBackground</span>
  </div>
  <p style="margin-bottom: 0.75rem; font-size: 0.92rem; color: #c9d1d9;">Governed by W3C SHACL shape <code>urn:robos:shape:GherkinBackgroundShape</code> within the <strong>Testing, Quality & BDD (robos.testing)</strong> (<code>robos.testing</code>) package store.</p>
  <div style="display: flex; flex-wrap: wrap; gap: 0.5rem; margin-top: 0.5rem;">
    <span style="background: #0d1117; border: 1px solid #21262d; padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.8rem; color: #8b949e;"><code>dcterms:title</code></span>
    <span style="background: #0d1117; border: 1px solid #21262d; padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.8rem; color: #8b949e;"><code>robos:steps</code></span>
    <span style="background: #0d1117; border: 1px solid #21262d; padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.8rem; color: #8b949e;"><code>robos:inFeature</code></span>
  </div>
</div>

---

**RobOS classification:** Testing & behavior. These RobOS-owned codes use Schema.org CategoryCode vocabulary.

## Property Constraints & SHACL Rules

| Property Path | Name | Multiplicity | Data Type | Classification | Constraint Rule / Validation Message |
|---|---|---|---|---|---|
| **`dcterms:title`** | Title / Display Name | `1..*` | `xsd:string` | Services & processing, Applications & entry points, Contracts & data models, Data stores & messaging, Libraries & build systems, Infrastructure & delivery, Organization & people, Projects & work items, Source control & artifacts, Agents & MCP, Documentation & decisions, Learning & assessment, Testing & behavior | Gherkin Background must have a title. |
| **`robos:steps`** | Scenario Steps | `1..*` | `Array<robos:ScenarioStep>` | Testing & behavior | Gherkin Background must define prerequisite steps. |
| **`robos:inFeature`** | inFeature | `1..*` | `xsd:string` | Testing & behavior | Gherkin Background must link to parent Gherkin feature. |

---

## Canonical OSLC JSON-LD Example

```json
{
  "@id": "urn:robos:gherkin:checkout-cart-validation:background",
  "@type": [
    "robos:GherkinBackground",
    "robos:Background",
    "schema:ItemList"
  ],
  "dcterms:title": "Customer Session & Cart Initialization",
  "robos:steps": [
    "Given the customer is logged in with valid token",
    "And the shopping cart is initialized"
  ],
  "robos:inFeature": "urn:robos:gherkin:checkout-cart-validation",
  "robos:package": "testing",
  "robos:namespace": "robos.testing",
  "robos:refersFrom": "https://cucumber.io/docs/gherkin/reference/#background",
  "robos:schemaOrgType": "https://schema.org/ItemList",
  "robos:domainStandard": "https://cucumber.io/docs/gherkin/reference/#background"
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
        "@id": "urn:robos:gherkin:checkout-cart-validation:background",
        "@type": [
            "robos:GherkinBackground",
            "robos:Background",
            "schema:ItemList"
        ],
        "dcterms:title": "Customer Session & Cart Initialization",
        "robos:steps": [
            "Given the customer is logged in with valid token",
            "And the shopping cart is initialized"
        ],
        "robos:inFeature": "urn:robos:gherkin:checkout-cart-validation",
        "robos:package": "testing",
        "robos:namespace": "robos.testing",
        "robos:refersFrom": "https://cucumber.io/docs/gherkin/reference/#background",
        "robos:schemaOrgType": "https://schema.org/ItemList",
        "robos:domainStandard": "https://cucumber.io/docs/gherkin/reference/#background"
    }
  ],
}));

console.log("Conforms:", result.conforms); // Expected: true
```