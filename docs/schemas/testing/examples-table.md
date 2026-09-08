---
title: Examples Table
layout: default
parent: Testing, Quality & BDD (robos.testing)
grand_parent: KGraph Schemas
nav_order: 7
permalink: /schemas/testing/examples-table.html
---

# Schema: `robos:ExamplesTable`
{: .no_toc }

Formal W3C SHACL constraint shape and OSLC JSON-LD specification for `robos:ExamplesTable` in the `testing` package store.
{: .fs-6 .fw-300 }

## Table of contents
{: .no_toc .text-delta }

1. TOC
{:toc}

---

## Specification Metadata

- **RDF / OWL Class**: `robos:ExamplesTable`
- **Aliases / Target Classes**: `robos:ExamplesTable`
- **SHACL Shape ID**: `urn:robos:shape:ExamplesTableShape`
- **Governing Package**: [Testing, Quality & BDD (robos.testing)]({{ '/schemas/testing.html' | relative_url }}) (`testing`)
- **Namespace**: `robos.testing`
- **Upstream Schema Basis (Refers From)**: [https://cucumber.io/docs/gherkin/reference/#examples](https://cucumber.io/docs/gherkin/reference/#examples)

---

## Upstream Schema Basis (Refers From)

This RobOS schema is modeled after and directly expands upon the upstream canonical standard:
- **Canonical Reference**: [https://cucumber.io/docs/gherkin/reference/#examples](https://cucumber.io/docs/gherkin/reference/#examples)
- **Provenance & Alignment**: When autonomous agents generate, expand, or validate instances of `robos:ExamplesTable`, they MUST adhere to and base their output on this referred schema object, extending it with RobOS SDLC properties.

---

## Entity Relationship & Schema Context

<div style="margin: 1.5rem 0; padding: 1.25rem; background: #161b22; border: 1px solid #30363d; border-radius: 8px;">
  <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.75rem; flex-wrap: wrap; gap: 0.5rem;">
    <span style="font-size: 1.15rem; font-weight: 700; color: #38bdf8;">Examples Table</span>
    <span style="font-family: monospace; background: #121927; color: #00e5ff; border: 1px solid rgba(0, 229, 255, 0.4); padding: 0.2rem 0.6rem; border-radius: 6px; font-size: 0.85rem;">robos:ExamplesTable</span>
  </div>
  <p style="margin-bottom: 0.75rem; font-size: 0.92rem; color: #c9d1d9;">Governed by W3C SHACL shape <code>urn:robos:shape:ExamplesTableShape</code> within the <strong>Testing, Quality & BDD (robos.testing)</strong> (<code>robos.testing</code>) package store.</p>
  <div style="display: flex; flex-wrap: wrap; gap: 0.5rem; margin-top: 0.5rem;">
    <span style="background: #0d1117; border: 1px solid #21262d; padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.8rem; color: #8b949e;"><code>dcterms:title</code></span>
    <span style="background: #0d1117; border: 1px solid #21262d; padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.8rem; color: #8b949e;"><code>robos:tableHeaders</code></span>
    <span style="background: #0d1117; border: 1px solid #21262d; padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.8rem; color: #8b949e;"><code>robos:tableRows</code></span>
  </div>
</div>

---

## Property Constraints & SHACL Rules

| Property Path | Name | Multiplicity | Data Type | Constraint Rule / Validation Message |
|---|---|---|---|---|
| **`dcterms:title`** | Title / Display Name | `1..*` | `xsd:string` | Examples Table must have a title. |
| **`robos:tableHeaders`** | Table Headers | `1..*` | `Array of xsd:string` | Examples Table must define header column names. |
| **`robos:tableRows`** | Table Rows | `1..*` | `Array of Arrays` | Examples Table must define parameter value rows. |

---

## Canonical OSLC JSON-LD Example

```json
{
  "@id": "urn:robos:examples:checkout-loyalty-tiers",
  "@type": [
    "robos:ExamplesTable"
  ],
  "dcterms:title": "Loyalty Tier Discounts",
  "robos:tableHeaders": [
    "tier",
    "amount",
    "discount"
  ],
  "robos:tableRows": [
    [
      "Bronze",
      "100",
      "5%"
    ],
    [
      "Silver",
      "100",
      "10%"
    ],
    [
      "Gold",
      "100",
      "20%"
    ]
  ],
  "robos:package": "testing",
  "robos:namespace": "robos.testing",
  "robos:refersFrom": "https://cucumber.io/docs/gherkin/reference/#examples"
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
        "@id": "urn:robos:examples:checkout-loyalty-tiers",
        "@type": [
            "robos:ExamplesTable"
        ],
        "dcterms:title": "Loyalty Tier Discounts",
        "robos:tableHeaders": [
            "tier",
            "amount",
            "discount"
        ],
        "robos:tableRows": [
            [
                "Bronze",
                "100",
                "5%"
            ],
            [
                "Silver",
                "100",
                "10%"
            ],
            [
                "Gold",
                "100",
                "20%"
            ]
        ],
        "robos:package": "testing",
        "robos:namespace": "robos.testing",
        "robos:refersFrom": "https://cucumber.io/docs/gherkin/reference/#examples"
    }
  ],
}));

console.log("Conforms:", result.conforms); // Expected: true
```