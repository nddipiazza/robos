---
title: Database Index
layout: default
parent: Core Platform (robos.core)
grand_parent: KGraph Schemas
nav_order: 11
permalink: /schemas/core-platform/database-index.html
---

# Schema: `robos:DatabaseIndex`
{: .no_toc }

Formal W3C SHACL constraint shape and OSLC JSON-LD specification for `robos:DatabaseIndex` in the `core-platform` package store.
{: .fs-6 .fw-300 }

## Table of contents
{: .no_toc .text-delta }

1. TOC
{:toc}

---

## Specification Metadata

- **RDF / OWL Class**: `robos:DatabaseIndex`
- **Aliases / Target Classes**: `robos:DatabaseIndex`
- **SHACL Shape ID**: `urn:robos:shape:DatabaseIndexShape`
- **Governing Package**: [Core Platform (robos.core)]({{ '/schemas/core-platform.html' | relative_url }}) (`core-platform`)
- **Namespace**: `robos.platform`
- **Upstream Schema Basis (Refers From)**: [https://schema.org/Index](https://schema.org/Index)

---

## Upstream Schema Basis (Refers From)

This RobOS schema is modeled after and directly expands upon the upstream canonical standard:
- **Canonical Reference**: [https://schema.org/Index](https://schema.org/Index)
- **Provenance & Alignment**: When autonomous agents generate, expand, or validate instances of `robos:DatabaseIndex`, they MUST adhere to and base their output on this referred schema object, extending it with RobOS SDLC properties.

---

## Entity Relationship & Schema Context

<div style="margin: 1.5rem 0; padding: 1.25rem; background: #161b22; border: 1px solid #30363d; border-radius: 8px;">
  <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.75rem; flex-wrap: wrap; gap: 0.5rem;">
    <span style="font-size: 1.15rem; font-weight: 700; color: #38bdf8;">Database Index</span>
    <span style="font-family: monospace; background: #121927; color: #00e5ff; border: 1px solid rgba(0, 229, 255, 0.4); padding: 0.2rem 0.6rem; border-radius: 6px; font-size: 0.85rem;">robos:DatabaseIndex</span>
  </div>
  <p style="margin-bottom: 0.75rem; font-size: 0.92rem; color: #c9d1d9;">Governed by W3C SHACL shape <code>urn:robos:shape:DatabaseIndexShape</code> within the <strong>Core Platform (robos.core)</strong> (<code>robos.platform</code>) package store.</p>
  <div style="display: flex; flex-wrap: wrap; gap: 0.5rem; margin-top: 0.5rem;">
    <span style="background: #0d1117; border: 1px solid #21262d; padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.8rem; color: #8b949e;"><code>dcterms:title</code></span>
    <span style="background: #0d1117; border: 1px solid #21262d; padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.8rem; color: #8b949e;"><code>robos:indexName</code></span>
    <span style="background: #0d1117; border: 1px solid #21262d; padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.8rem; color: #8b949e;"><code>robos:table</code></span>
  </div>
</div>

---

## Property Constraints & SHACL Rules

| Property Path | Name | Multiplicity | Data Type | Constraint Rule / Validation Message |
|---|---|---|---|---|
| **`dcterms:title`** | Title / Display Name | `1..*` | `xsd:string` | Database Index must have a title. |
| **`robos:indexName`** | Index Name | `1..*` | `xsd:string` | Database Index must specify index name. |
| **`robos:table`** | Parent Table | `1..*` | `URI (robos:DatabaseTable)` | Database Index must link to parent table. |

---

## Canonical OSLC JSON-LD Example

```json
{
  "@id": "urn:robos:core-platform:database-index-sample",
  "@type": [
    "robos:DatabaseIndex",
    "oslc:Resource"
  ],
  "dcterms:title": "Sample Database Index",
  "dcterms:description": "Canonical reference instance for robos:DatabaseIndex.",
  "robos:package": "core-platform",
  "robos:namespace": "robos.platform",
  "robos:indexName": "idx_sample_column",
  "robos:table": "urn:robos:db-table:sample-table",
  "robos:refersFrom": "https://schema.org/Index"
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
        "@id": "urn:robos:core-platform:database-index-sample",
        "@type": [
            "robos:DatabaseIndex",
            "oslc:Resource"
        ],
        "dcterms:title": "Sample Database Index",
        "dcterms:description": "Canonical reference instance for robos:DatabaseIndex.",
        "robos:package": "core-platform",
        "robos:namespace": "robos.platform",
        "robos:indexName": "idx_sample_column",
        "robos:table": "urn:robos:db-table:sample-table",
        "robos:refersFrom": "https://schema.org/Index"
    }
  ],
}));

console.log("Conforms:", result.conforms); // Expected: true
```