---
title: Doc String
layout: default
parent: Testing, Quality & BDD (robos.testing)
grand_parent: KGraph Schemas
nav_order: 10
permalink: /schemas/testing/doc-string.html
---

# Schema: `robos:DocString`
{: .no_toc }

Formal W3C SHACL constraint shape and OSLC JSON-LD specification for `robos:DocString` in the `testing` package store.
{: .fs-6 .fw-300 }

## Table of contents
{: .no_toc .text-delta }

1. TOC
{:toc}

---

## Specification Metadata

- **RDF / OWL Class**: `robos:DocString`
- **Aliases / Target Classes**: `robos:DocString`
- **SHACL Shape ID**: `urn:robos:shape:DocStringShape`
- **Governing Package**: [Testing, Quality & BDD (robos.testing)]({{ '/schemas/testing.html' | relative_url }}) (`testing`)
- **Namespace**: `robos.testing`
- **Schema.org Classification**: [https://schema.org/Text](https://schema.org/Text)
- **Domain De Facto Standard**: [https://cucumber.io/docs/gherkin/reference/#doc-strings](https://cucumber.io/docs/gherkin/reference/#doc-strings)
- **Upstream Schema Basis (Refers From)**: [https://cucumber.io/docs/gherkin/reference/#doc-strings](https://cucumber.io/docs/gherkin/reference/#doc-strings)

---

## Upstream Schema Basis (Refers From) & Global Standards Provenance

This RobOS schema is modeled after and directly aligns with two levels of global standards:
- **Universal Schema.org Class**: [https://schema.org/Text](https://schema.org/Text) (100% interoperability with search engines, web indexers, and general AI reasoning)
- **Specialized Domain Standard**: [https://cucumber.io/docs/gherkin/reference/#doc-strings](https://cucumber.io/docs/gherkin/reference/#doc-strings) (de facto standard for domain-specific ALM, BDD, or infrastructure operations)
- **Canonical Reference**: [https://cucumber.io/docs/gherkin/reference/#doc-strings](https://cucumber.io/docs/gherkin/reference/#doc-strings)
- **Agent Guidelines**: When autonomous agents generate, expand, or validate instances of `robos:DocString`, they MUST adhere to and base their output on this referred schema object and universal Schema.org parent class, extending it with RobOS SDLC properties.

---

## Entity Relationship & Schema Context

<div style="margin: 1.5rem 0; padding: 1.25rem; background: #161b22; border: 1px solid #30363d; border-radius: 8px;">
  <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.75rem; flex-wrap: wrap; gap: 0.5rem;">
    <span style="font-size: 1.15rem; font-weight: 700; color: #38bdf8;">Doc String</span>
    <span style="font-family: monospace; background: #121927; color: #00e5ff; border: 1px solid rgba(0, 229, 255, 0.4); padding: 0.2rem 0.6rem; border-radius: 6px; font-size: 0.85rem;">robos:DocString</span>
  </div>
  <p style="margin-bottom: 0.75rem; font-size: 0.92rem; color: #c9d1d9;">Governed by W3C SHACL shape <code>urn:robos:shape:DocStringShape</code> within the <strong>Testing, Quality & BDD (robos.testing)</strong> (<code>robos.testing</code>) package store.</p>
  <div style="display: flex; flex-wrap: wrap; gap: 0.5rem; margin-top: 0.5rem;">
    <span style="background: #0d1117; border: 1px solid #21262d; padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.8rem; color: #8b949e;"><code>robos:content</code></span>
    <span style="background: #0d1117; border: 1px solid #21262d; padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.8rem; color: #8b949e;"><code>robos:step</code></span>
  </div>
</div>

---

## Property Constraints & SHACL Rules

| Property Path | Name | Multiplicity | Data Type | Constraint Rule / Validation Message |
|---|---|---|---|---|
| **`robos:content`** | content | `1..*` | `xsd:string` | DocString must define text content. |
| **`robos:step`** | step | `1..*` | `xsd:string` | DocString must link to parent scenario step. |

---

## Canonical OSLC JSON-LD Example

```json
{
  "@id": "urn:robos:docstring:checkout-payload",
  "@type": [
    "robos:DocString",
    "schema:Text"
  ],
  "robos:step": "urn:robos:step:checkout-payload-docstring",
  "robos:content": "{\n  \"cartId\": \"cart-9821\",\n  \"currency\": \"USD\",\n  \"paymentMethod\": \"credit_card\"\n}",
  "robos:contentType": "application/json",
  "robos:package": "testing",
  "robos:namespace": "robos.testing",
  "robos:refersFrom": "https://cucumber.io/docs/gherkin/reference/#doc-strings",
  "robos:schemaOrgType": "https://schema.org/Text",
  "robos:domainStandard": "https://cucumber.io/docs/gherkin/reference/#doc-strings"
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
        "@id": "urn:robos:docstring:checkout-payload",
        "@type": [
            "robos:DocString",
            "schema:Text"
        ],
        "robos:step": "urn:robos:step:checkout-payload-docstring",
        "robos:content": "{\n  \"cartId\": \"cart-9821\",\n  \"currency\": \"USD\",\n  \"paymentMethod\": \"credit_card\"\n}",
        "robos:contentType": "application/json",
        "robos:package": "testing",
        "robos:namespace": "robos.testing",
        "robos:refersFrom": "https://cucumber.io/docs/gherkin/reference/#doc-strings",
        "robos:schemaOrgType": "https://schema.org/Text",
        "robos:domainStandard": "https://cucumber.io/docs/gherkin/reference/#doc-strings"
    }
  ],
}));

console.log("Conforms:", result.conforms); // Expected: true
```