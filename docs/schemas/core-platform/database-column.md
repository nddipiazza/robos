---
title: Database Column
layout: default
parent: Core Platform (robos.core)
grand_parent: KGraph Schemas
nav_order: 10
permalink: /schemas/core-platform/database-column.html
---

# Schema: `robos:DatabaseColumn`
{: .no_toc }

Formal W3C SHACL constraint shape and OSLC JSON-LD specification for `robos:DatabaseColumn` in the `core-platform` package store.
{: .fs-6 .fw-300 }

## Table of contents
{: .no_toc .text-delta }

1. TOC
{:toc}

---

## Specification Metadata

- **RDF / OWL Class**: `robos:DatabaseColumn`
- **Aliases / Target Classes**: `robos:DatabaseColumn`
- **SHACL Shape ID**: `urn:robos:shape:DatabaseColumnShape`
- **Governing Package**: [Core Platform (robos.core)]({{ '/schemas/core-platform.html' | relative_url }}) (`core-platform`)
- **Namespace**: `robos.platform`

---

## Entity Relationship & Schema Context

<div style="margin: 1.5rem 0; padding: 1.25rem; background: #161b22; border: 1px solid #30363d; border-radius: 8px;">
  <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.75rem; flex-wrap: wrap; gap: 0.5rem;">
    <span style="font-size: 1.15rem; font-weight: 700; color: #38bdf8;">Database Column</span>
    <span style="font-family: monospace; background: #121927; color: #00e5ff; border: 1px solid rgba(0, 229, 255, 0.4); padding: 0.2rem 0.6rem; border-radius: 6px; font-size: 0.85rem;">robos:DatabaseColumn</span>
  </div>
  <p style="margin-bottom: 0.75rem; font-size: 0.92rem; color: #c9d1d9;">Governed by W3C SHACL shape <code>urn:robos:shape:DatabaseColumnShape</code> within the <strong>Core Platform (robos.core)</strong> (<code>robos.platform</code>) package store.</p>
  <div style="display: flex; flex-wrap: wrap; gap: 0.5rem; margin-top: 0.5rem;">
    <span style="background: #0d1117; border: 1px solid #21262d; padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.8rem; color: #8b949e;"><code>dcterms:title</code></span>
    <span style="background: #0d1117; border: 1px solid #21262d; padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.8rem; color: #8b949e;"><code>robos:columnName</code></span>
    <span style="background: #0d1117; border: 1px solid #21262d; padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.8rem; color: #8b949e;"><code>robos:dataType</code></span>
    <span style="background: #0d1117; border: 1px solid #21262d; padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.8rem; color: #8b949e;"><code>robos:table</code></span>
  </div>
</div>

---

## Property Constraints & SHACL Rules

| Property Path | Name | Multiplicity | Data Type | Constraint Rule / Validation Message |
|---|---|---|---|---|
| **`dcterms:title`** | Title / Display Name | `1..*` | `xsd:string` | Database Column must have a title. |
| **`robos:columnName`** | Column Name | `1..*` | `xsd:string` | Database Column must specify column name. |
| **`robos:dataType`** | Column Data Type | `1..*` | `xsd:string` | Database Column must declare data type. |
| **`robos:table`** | Parent Table | `1..*` | `URI (robos:DatabaseTable)` | Database Column must link to parent table. |

---

## Canonical OSLC JSON-LD Example

```json
{
  "@id": "urn:robos:core-platform:database-column-sample",
  "@type": [
    "robos:DatabaseColumn",
    "oslc:Resource"
  ],
  "dcterms:title": "Sample Database Column",
  "dcterms:description": "Canonical reference instance for robos:DatabaseColumn.",
  "robos:package": "core-platform",
  "robos:namespace": "robos.platform",
  "robos:columnName": "sample_column",
  "robos:dataType": "varchar(255)",
  "robos:table": "urn:robos:db-table:sample-table"
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
        "@id": "urn:robos:core-platform:database-column-sample",
        "@type": [
            "robos:DatabaseColumn",
            "oslc:Resource"
        ],
        "dcterms:title": "Sample Database Column",
        "dcterms:description": "Canonical reference instance for robos:DatabaseColumn.",
        "robos:package": "core-platform",
        "robos:namespace": "robos.platform",
        "robos:columnName": "sample_column",
        "robos:dataType": "varchar(255)",
        "robos:table": "urn:robos:db-table:sample-table"
    }
  ],
}));

console.log("Conforms:", result.conforms); // Expected: true
```