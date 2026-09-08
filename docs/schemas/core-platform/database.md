---
title: Database
layout: default
parent: Core Platform (robos.core)
grand_parent: KGraph Schemas
nav_order: 4
permalink: /schemas/core-platform/database.html
---

# Schema: `robos:Database`
{: .no_toc }

Formal W3C SHACL constraint shape and OSLC JSON-LD specification for `robos:Database` in the `core-platform` package store.
{: .fs-6 .fw-300 }

## Table of contents
{: .no_toc .text-delta }

1. TOC
{:toc}

---

## Specification Metadata

- **RDF / OWL Class**: `robos:Database`
- **Aliases / Target Classes**: `robos:Database`, `robos:RelationalDatabase`
- **SHACL Shape ID**: `urn:robos:shape:DatabaseShape`
- **Governing Package**: [Core Platform (robos.core)]({{ '/schemas/core-platform.html' | relative_url }}) (`core-platform`)
- **Namespace**: `robos.platform`

---

## Entity Relationship & Schema Context

<div style="margin: 1.5rem 0; padding: 1.25rem; background: #161b22; border: 1px solid #30363d; border-radius: 8px;">
  <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.75rem; flex-wrap: wrap; gap: 0.5rem;">
    <span style="font-size: 1.15rem; font-weight: 700; color: #38bdf8;">Database</span>
    <span style="font-family: monospace; background: #121927; color: #00e5ff; border: 1px solid rgba(0, 229, 255, 0.4); padding: 0.2rem 0.6rem; border-radius: 6px; font-size: 0.85rem;">robos:Database</span>
  </div>
  <p style="margin-bottom: 0.75rem; font-size: 0.92rem; color: #c9d1d9;">Governed by W3C SHACL shape <code>urn:robos:shape:DatabaseShape</code> within the <strong>Core Platform (robos.core)</strong> (<code>robos.platform</code>) package store.</p>
  <div style="display: flex; flex-wrap: wrap; gap: 0.5rem; margin-top: 0.5rem;">
    <span style="background: #0d1117; border: 1px solid #21262d; padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.8rem; color: #8b949e;"><code>dcterms:title</code></span>
    <span style="background: #0d1117; border: 1px solid #21262d; padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.8rem; color: #8b949e;"><code>robos:engine</code></span>
    <span style="background: #0d1117; border: 1px solid #21262d; padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.8rem; color: #8b949e;"><code>robos:databaseName</code></span>
    <span style="background: #0d1117; border: 1px solid #21262d; padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.8rem; color: #8b949e;"><code>robos:host</code></span>
  </div>
</div>

---

## Property Constraints & SHACL Rules

| Property Path | Name | Multiplicity | Data Type | Constraint Rule / Validation Message |
|---|---|---|---|---|
| **`dcterms:title`** | Title / Display Name | `1..*` | `xsd:string` | Database must have a title or display name. |
| **`robos:engine`** | engine | `1..*` | `xsd:string` | Database must declare its engine (postgresql, mysql, sqlite, oracle, etc.). |
| **`robos:databaseName`** | databaseName | `1..*` | `xsd:string` | Database must specify a logical database name. |
| **`robos:host`** | host | `1..*` | `xsd:string` | Database must specify a host address or service DNS. |

---

## Canonical OSLC JSON-LD Example

```json
{
  "@id": "urn:robos:db:acme-orders-postgres",
  "@type": [
    "oslc_am:Resource",
    "robos:Database",
    "robos:RelationalDatabase"
  ],
  "dcterms:title": "Acme Orders PostgreSQL Primary Cluster",
  "dcterms:description": "High-availability relational PostgreSQL cluster housing transactional order and invoice schemas.",
  "robos:engine": "postgresql",
  "robos:databaseName": "orders_db",
  "robos:host": "postgres.internal.acme.corp",
  "robos:port": 5432,
  "robos:schemaMigration": "flyway",
  "robos:package": "core-platform",
  "robos:namespace": "robos.platform"
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
        "@id": "urn:robos:db:acme-orders-postgres",
        "@type": [
            "oslc_am:Resource",
            "robos:Database",
            "robos:RelationalDatabase"
        ],
        "dcterms:title": "Acme Orders PostgreSQL Primary Cluster",
        "dcterms:description": "High-availability relational PostgreSQL cluster housing transactional order and invoice schemas.",
        "robos:engine": "postgresql",
        "robos:databaseName": "orders_db",
        "robos:host": "postgres.internal.acme.corp",
        "robos:port": 5432,
        "robos:schemaMigration": "flyway",
        "robos:package": "core-platform",
        "robos:namespace": "robos.platform"
    }
  ],
}));

console.log("Conforms:", result.conforms); // Expected: true
```