---
title: Scenario Step
layout: default
parent: Testing, Quality & BDD (robos.testing)
grand_parent: KGraph Schemas
nav_order: 2
permalink: /schemas/testing/scenario-step.html
---

# Schema: `robos:ScenarioStep`
{: .no_toc }

Formal W3C SHACL constraint shape and OSLC JSON-LD specification for `robos:ScenarioStep` in the `testing` package store.
{: .fs-6 .fw-300 }

## Table of contents
{: .no_toc .text-delta }

1. TOC
{:toc}

---

## Specification Metadata

- **RDF / OWL Class**: `robos:ScenarioStep`
- **Aliases / Target Classes**: `robos:ScenarioStep`
- **SHACL Shape ID**: `urn:robos:shape:ScenarioStepShape`
- **Governing Package**: [Testing, Quality & BDD (robos.testing)]({{ '/schemas/testing.html' | relative_url }}) (`testing`)
- **Namespace**: `robos.testing`
- **Schema.org Classification**: [https://schema.org/HowToStep](https://schema.org/HowToStep)
- **Domain De Facto Standard**: [https://cucumber.io/docs/gherkin/reference/#steps](https://cucumber.io/docs/gherkin/reference/#steps)
- **Upstream Schema Basis (Refers From)**: [https://cucumber.io/docs/gherkin/reference/#steps](https://cucumber.io/docs/gherkin/reference/#steps)

---

## Upstream Schema Basis (Refers From) & Global Standards Provenance

This RobOS schema is modeled after and directly aligns with two levels of global standards:
- **Universal Schema.org Class**: [https://schema.org/HowToStep](https://schema.org/HowToStep) (100% interoperability with search engines, web indexers, and general AI reasoning)
- **Specialized Domain Standard**: [https://cucumber.io/docs/gherkin/reference/#steps](https://cucumber.io/docs/gherkin/reference/#steps) (de facto standard for domain-specific ALM, BDD, or infrastructure operations)
- **Canonical Reference**: [https://cucumber.io/docs/gherkin/reference/#steps](https://cucumber.io/docs/gherkin/reference/#steps)
- **Agent Guidelines**: When autonomous agents generate, expand, or validate instances of `robos:ScenarioStep`, they MUST adhere to and base their output on this referred schema object and universal Schema.org parent class, extending it with RobOS SDLC properties.

---

## Entity Relationship & Schema Context

<div style="margin: 1.5rem 0; padding: 1.25rem; background: #161b22; border: 1px solid #30363d; border-radius: 8px;">
  <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.75rem; flex-wrap: wrap; gap: 0.5rem;">
    <span style="font-size: 1.15rem; font-weight: 700; color: #38bdf8;">Scenario Step</span>
    <span style="font-family: monospace; background: #121927; color: #00e5ff; border: 1px solid rgba(0, 229, 255, 0.4); padding: 0.2rem 0.6rem; border-radius: 6px; font-size: 0.85rem;">robos:ScenarioStep</span>
  </div>
  <p style="margin-bottom: 0.75rem; font-size: 0.92rem; color: #c9d1d9;">Governed by W3C SHACL shape <code>urn:robos:shape:ScenarioStepShape</code> within the <strong>Testing, Quality & BDD (robos.testing)</strong> (<code>robos.testing</code>) package store.</p>
  <div style="display: flex; flex-wrap: wrap; gap: 0.5rem; margin-top: 0.5rem;">
    <span style="background: #0d1117; border: 1px solid #21262d; padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.8rem; color: #8b949e;"><code>robos:keyword</code></span>
    <span style="background: #0d1117; border: 1px solid #21262d; padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.8rem; color: #8b949e;"><code>robos:stepText</code></span>
  </div>
</div>

---

## Property Constraints & SHACL Rules

| Property Path | Name | Multiplicity | Data Type | Constraint Rule / Validation Message |
|---|---|---|---|---|
| **`robos:keyword`** | BDD Step Keyword | `1..*` | `xsd:string` | Scenario Step must specify keyword (Given, When, Then, And, But). |
| **`robos:stepText`** | BDD Step Expression | `1..*` | `xsd:string` | Scenario Step must specify step expression text. |

---

## Canonical OSLC JSON-LD Example

```json
{
  "@id": "urn:robos:step:checkout-add-item-with-table",
  "@type": [
    "robos:ScenarioStep",
    "schema:HowToStep"
  ],
  "robos:keyword": "When",
  "robos:stepText": "the customer adds items to cart with configuration",
  "robos:dataTable": "urn:robos:datatable:cart-items",
  "robos:package": "testing",
  "robos:namespace": "robos.testing",
  "robos:refersFrom": "https://cucumber.io/docs/gherkin/reference/#steps",
  "robos:schemaOrgType": "https://schema.org/HowToStep",
  "robos:domainStandard": "https://cucumber.io/docs/gherkin/reference/#steps"
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
        "@id": "urn:robos:step:checkout-add-item-with-table",
        "@type": [
            "robos:ScenarioStep",
            "schema:HowToStep"
        ],
        "robos:keyword": "When",
        "robos:stepText": "the customer adds items to cart with configuration",
        "robos:dataTable": "urn:robos:datatable:cart-items",
        "robos:package": "testing",
        "robos:namespace": "robos.testing",
        "robos:refersFrom": "https://cucumber.io/docs/gherkin/reference/#steps",
        "robos:schemaOrgType": "https://schema.org/HowToStep",
        "robos:domainStandard": "https://cucumber.io/docs/gherkin/reference/#steps"
    }
  ],
}));

console.log("Conforms:", result.conforms); // Expected: true
```