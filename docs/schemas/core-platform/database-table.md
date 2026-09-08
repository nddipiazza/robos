---
title: Database Table
layout: default
parent: Core Platform (robos.core)
grand_parent: KGraph Schemas
nav_order: 9
permalink: /schemas/core-platform/database-table.html
---

# Schema: `robos:DatabaseTable`
{: .no_toc }

Formal W3C SHACL constraint shape and OSLC JSON-LD specification for `robos:DatabaseTable` in the `core-platform` package store.
{: .fs-6 .fw-300 }

## Table of contents
{: .no_toc .text-delta }

1. TOC
{:toc}

---

## Specification Metadata

- **RDF / OWL Class**: `robos:DatabaseTable`
- **Aliases / Target Classes**: `robos:DatabaseTable`
- **SHACL Shape ID**: `urn:robos:shape:DatabaseTableShape`
- **Governing Package**: [Core Platform (robos.core)]({{ '/schemas/core-platform.html' | relative_url }}) (`core-platform`)
- **Namespace**: `robos.platform`

---

## Entity Relationship & Schema Context

<div style="margin: 1.5rem 0; padding: 1.25rem; background: #161b22; border: 1px solid #30363d; border-radius: 8px;">
  <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.75rem; flex-wrap: wrap; gap: 0.5rem;">
    <span style="font-size: 1.15rem; font-weight: 700; color: #38bdf8;">Database Table</span>
    <span style="font-family: monospace; background: #121927; color: #00e5ff; border: 1px solid rgba(0, 229, 255, 0.4); padding: 0.2rem 0.6rem; border-radius: 6px; font-size: 0.85rem;">robos:DatabaseTable</span>
  </div>
  <p style="margin-bottom: 0.75rem; font-size: 0.92rem; color: #c9d1d9;">Governed by W3C SHACL shape <code>urn:robos:shape:DatabaseTableShape</code> within the <strong>Core Platform (robos.core)</strong> (<code>robos.platform</code>) package store.</p>
  <div style="display: flex; flex-wrap: wrap; gap: 0.5rem; margin-top: 0.5rem;">
    <span style="background: #0d1117; border: 1px solid #21262d; padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.8rem; color: #8b949e;"><code>dcterms:title</code></span>
    <span style="background: #0d1117; border: 1px solid #21262d; padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.8rem; color: #8b949e;"><code>robos:tableName</code></span>
    <span style="background: #0d1117; border: 1px solid #21262d; padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.8rem; color: #8b949e;"><code>robos:database</code></span>
  </div>
</div>

---

## Property Constraints & SHACL Rules

| Property Path | Name | Multiplicity | Data Type | Constraint Rule / Validation Message |
|---|---|---|---|---|
| **`dcterms:title`** | Title / Display Name | `1..*` | `xsd:string` | Database Table must have a title. |
| **`robos:tableName`** | Database Table Name | `1..*` | `xsd:string` | Database Table must specify table name. |
| **`robos:database`** | Parent Database | `1..*` | `URI (robos:Database | robos:NoSQLDatabase)` | Database Table must link to parent database. |

---

## Canonical OSLC JSON-LD Example

```json
{
  "@id": "urn:robos:core-platform:database-table-sample",
  "@type": [
    "robos:DatabaseTable",
    "oslc:Resource"
  ],
  "dcterms:title": "Sample Database Table",
  "dcterms:description": "Canonical reference instance for robos:DatabaseTable.",
  "robos:package": "core-platform",
  "robos:namespace": "robos.platform",
  "robos:tableName": "sample_table",
  "robos:database": "urn:robos:db:acme-orders-postgres"
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
        "@id": "urn:robos:core-platform:database-table-sample",
        "@type": [
            "robos:DatabaseTable",
            "oslc:Resource"
        ],
        "dcterms:title": "Sample Database Table",
        "dcterms:description": "Canonical reference instance for robos:DatabaseTable.",
        "robos:package": "core-platform",
        "robos:namespace": "robos.platform",
        "robos:tableName": "sample_table",
        "robos:database": "urn:robos:db:acme-orders-postgres"
    }
  ],
}));

console.log("Conforms:", result.conforms); // Expected: true
```