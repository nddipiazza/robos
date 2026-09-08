---
title: Database
layout: default
parent: Core Platform (robos.core)
grand_parent: KGraph Schemas
nav_order: 2
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
- **Schema.org Classification**: [https://schema.org/DataStore](https://schema.org/DataStore)
- **Domain De Facto Standard**: [https://www.iso.org/standard/63555.html](https://www.iso.org/standard/63555.html)
- **Upstream Schema Basis (Refers From)**: [https://schema.org/DataStore](https://schema.org/DataStore)

---

## Upstream Schema Basis (Refers From) & Global Standards Provenance

This RobOS schema is modeled after and directly aligns with two levels of global standards:
- **Universal Schema.org Class**: [https://schema.org/DataStore](https://schema.org/DataStore) (100% interoperability with search engines, web indexers, and general AI reasoning)
- **Specialized Domain Standard**: [https://www.iso.org/standard/63555.html](https://www.iso.org/standard/63555.html) (de facto standard for domain-specific ALM, BDD, or infrastructure operations)
- **Canonical Reference**: [https://schema.org/DataStore](https://schema.org/DataStore)
- **Agent Guidelines**: When autonomous agents generate, expand, or validate instances of `robos:Database`, they MUST adhere to and base their output on this referred schema object and universal Schema.org parent class, extending it with RobOS SDLC properties.

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
| **`robos:host`** | Routing Hostname | `1..*` | `xsd:string` | Database must specify a host address or service DNS. |

---

## Canonical OSLC JSON-LD Example

```json
{
  "@id": "urn:robos:db:acme-orders-postgres",
  "@type": [
    "oslc_am:Resource",
    "robos:Database",
    "robos:RelationalDatabase",
    "schema:DataStore"
  ],
  "dcterms:title": "Acme Orders PostgreSQL Primary Cluster",
  "dcterms:description": "High-availability relational PostgreSQL cluster housing transactional order and invoice schemas.",
  "robos:engine": "postgresql",
  "robos:databaseName": "orders_db",
  "robos:host": "postgres.internal.acme.corp",
  "robos:port": 5432,
  "robos:schemaMigration": "flyway",
  "robos:package": "core-platform",
  "robos:namespace": "robos.platform",
  "robos:schemaOrgType": "https://schema.org/DataStore",
  "robos:domainStandard": "https://www.iso.org/standard/63555.html"
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
            "robos:RelationalDatabase",
            "schema:DataStore"
        ],
        "dcterms:title": "Acme Orders PostgreSQL Primary Cluster",
        "dcterms:description": "High-availability relational PostgreSQL cluster housing transactional order and invoice schemas.",
        "robos:engine": "postgresql",
        "robos:databaseName": "orders_db",
        "robos:host": "postgres.internal.acme.corp",
        "robos:port": 5432,
        "robos:schemaMigration": "flyway",
        "robos:package": "core-platform",
        "robos:namespace": "robos.platform",
        "robos:schemaOrgType": "https://schema.org/DataStore",
        "robos:domainStandard": "https://www.iso.org/standard/63555.html"
    }
  ],
}));

console.log("Conforms:", result.conforms); // Expected: true
```