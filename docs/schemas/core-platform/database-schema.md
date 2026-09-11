---
title: Database Schema
layout: default
parent: Core Platform (robos.core)
grand_parent: KGraph Schemas
nav_order: 8
permalink: /schemas/core-platform/database-schema.html
---

# Schema: `robos:DatabaseSchema`
{: .no_toc }

Formal W3C SHACL constraint shape and OSLC JSON-LD specification for `robos:DatabaseSchema` in the `core-platform` package store.
{: .fs-6 .fw-300 }

## Table of contents
{: .no_toc .text-delta }

1. TOC
{:toc}

---

## Specification Metadata

- **RDF / OWL Class**: `robos:DatabaseSchema`
- **Aliases / Target Classes**: `robos:DatabaseSchema`
- **SHACL Shape ID**: `urn:robos:shape:DatabaseSchemaShape`
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
- **Agent Guidelines**: When autonomous agents generate, expand, or validate instances of `robos:DatabaseSchema`, they MUST adhere to and base their output on this referred schema object and universal Schema.org parent class, extending it with RobOS SDLC properties.

---

## Entity Relationship & Schema Context

<div style="margin: 1.5rem 0; padding: 1.25rem; background: #161b22; border: 1px solid #30363d; border-radius: 8px;">
  <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.75rem; flex-wrap: wrap; gap: 0.5rem;">
    <span style="font-size: 1.15rem; font-weight: 700; color: #38bdf8;">Database Schema</span>
    <span style="font-family: monospace; background: #121927; color: #00e5ff; border: 1px solid rgba(0, 229, 255, 0.4); padding: 0.2rem 0.6rem; border-radius: 6px; font-size: 0.85rem;">robos:DatabaseSchema</span>
  </div>
  <p style="margin-bottom: 0.75rem; font-size: 0.92rem; color: #c9d1d9;">Governed by W3C SHACL shape <code>urn:robos:shape:DatabaseSchemaShape</code> within the <strong>Core Platform (robos.core)</strong> (<code>robos.platform</code>) package store.</p>
  <div style="display: flex; flex-wrap: wrap; gap: 0.5rem; margin-top: 0.5rem;">
    <span style="background: #0d1117; border: 1px solid #21262d; padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.8rem; color: #8b949e;"><code>dcterms:title</code></span>
    <span style="background: #0d1117; border: 1px solid #21262d; padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.8rem; color: #8b949e;"><code>robos:schemaName</code></span>
    <span style="background: #0d1117; border: 1px solid #21262d; padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.8rem; color: #8b949e;"><code>robos:database</code></span>
  </div>
</div>

---

**RobOS classification:** Data stores & messaging. These RobOS-owned codes use Schema.org CategoryCode vocabulary.

## Property Constraints & SHACL Rules

| Property Path | Name | Multiplicity | Data Type | Classification | Constraint Rule / Validation Message |
|---|---|---|---|---|---|
| **`dcterms:title`** | Title / Display Name | `1..*` | `xsd:string` | Services & processing, Applications & entry points, Contracts & data models, Data stores & messaging, Libraries & build systems, Infrastructure & delivery, Organization & people, Projects & work items, Source control & artifacts, Agents & MCP, Documentation & decisions, Learning & assessment, Testing & behavior | Database Schema must have a title. |
| **`robos:schemaName`** | Database Schema Name | `1..*` | `xsd:string` | Data stores & messaging | Database Schema must specify schema name. |
| **`robos:database`** | Parent Database | `1..*` | `URI (robos:Database | robos:NoSQLDatabase)` | Data stores & messaging | Database Schema must link to parent database. |

---

## Canonical OSLC JSON-LD Example

```json
{
  "@id": "urn:robos:core-platform:database-schema-sample",
  "@type": [
    "robos:DatabaseSchema",
    "schema:DataStore",
    "oslc:Resource"
  ],
  "dcterms:title": "Sample Database Schema",
  "dcterms:description": "Canonical reference instance for robos:DatabaseSchema.",
  "robos:package": "core-platform",
  "robos:namespace": "robos.platform",
  "robos:schemaName": "public",
  "robos:database": "urn:robos:db:acme-orders-postgres",
  "robos:schemaOrgType": "https://schema.org/DataStore",
  "robos:domainStandard": "https://www.iso.org/standard/63555.html",
  "robos:refersFrom": "https://schema.org/DataStore"
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
        "@id": "urn:robos:core-platform:database-schema-sample",
        "@type": [
            "robos:DatabaseSchema",
            "schema:DataStore",
            "oslc:Resource"
        ],
        "dcterms:title": "Sample Database Schema",
        "dcterms:description": "Canonical reference instance for robos:DatabaseSchema.",
        "robos:package": "core-platform",
        "robos:namespace": "robos.platform",
        "robos:schemaName": "public",
        "robos:database": "urn:robos:db:acme-orders-postgres",
        "robos:schemaOrgType": "https://schema.org/DataStore",
        "robos:domainStandard": "https://www.iso.org/standard/63555.html",
        "robos:refersFrom": "https://schema.org/DataStore"
    }
  ],
}));

console.log("Conforms:", result.conforms); // Expected: true
```