---
title: No SQLDatabase
layout: default
parent: Core Platform (robos.core)
grand_parent: KGraph Schemas
nav_order: 3
permalink: /schemas/core-platform/no-sqldatabase.html
---

# Schema: `robos:NoSQLDatabase`
{: .no_toc }

Formal W3C SHACL constraint shape and OSLC JSON-LD specification for `robos:NoSQLDatabase` in the `core-platform` package store.
{: .fs-6 .fw-300 }

## Table of contents
{: .no_toc .text-delta }

1. TOC
{:toc}

---

## Specification Metadata

- **RDF / OWL Class**: `robos:NoSQLDatabase`
- **Aliases / Target Classes**: `robos:NoSQLDatabase`, `robos:CacheStore`, `robos:DocumentStore`, `robos:KeyValueStore`
- **SHACL Shape ID**: `urn:robos:shape:NoSQLDatabaseShape`
- **Governing Package**: [Core Platform (robos.core)]({{ '/schemas/core-platform.html' | relative_url }}) (`core-platform`)
- **Namespace**: `robos.platform`

---

## Entity Relationship & Schema Context

<div style="margin: 1.5rem 0; padding: 1.25rem; background: #161b22; border: 1px solid #30363d; border-radius: 8px;">
  <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.75rem; flex-wrap: wrap; gap: 0.5rem;">
    <span style="font-size: 1.15rem; font-weight: 700; color: #38bdf8;">No SQLDatabase</span>
    <span style="font-family: monospace; background: #121927; color: #00e5ff; border: 1px solid rgba(0, 229, 255, 0.4); padding: 0.2rem 0.6rem; border-radius: 6px; font-size: 0.85rem;">robos:NoSQLDatabase</span>
  </div>
  <p style="margin-bottom: 0.75rem; font-size: 0.92rem; color: #c9d1d9;">Governed by W3C SHACL shape <code>urn:robos:shape:NoSQLDatabaseShape</code> within the <strong>Core Platform (robos.core)</strong> (<code>robos.platform</code>) package store.</p>
  <div style="display: flex; flex-wrap: wrap; gap: 0.5rem; margin-top: 0.5rem;">
    <span style="background: #0d1117; border: 1px solid #21262d; padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.8rem; color: #8b949e;"><code>dcterms:title</code></span>
    <span style="background: #0d1117; border: 1px solid #21262d; padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.8rem; color: #8b949e;"><code>robos:engine</code></span>
    <span style="background: #0d1117; border: 1px solid #21262d; padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.8rem; color: #8b949e;"><code>robos:host</code></span>
  </div>
</div>

---

## Property Constraints & SHACL Rules

| Property Path | Name | Multiplicity | Data Type | Constraint Rule / Validation Message |
|---|---|---|---|---|
| **`dcterms:title`** | Title / Display Name | `1..*` | `xsd:string` | NoSQL Database must have a title or display name. |
| **`robos:engine`** | engine | `1..*` | `xsd:string` | NoSQL Database must declare engine (redis, mongodb, cassandra, dynamodb, elasticsearch). |
| **`robos:host`** | Routing Hostname | `1..*` | `xsd:string` | NoSQL Database must specify a host address or cluster endpoint. |

---

## Canonical OSLC JSON-LD Example

```json
{
  "@id": "urn:robos:db:acme-session-redis",
  "@type": [
    "oslc_am:Resource",
    "robos:NoSQLDatabase",
    "robos:CacheStore"
  ],
  "dcterms:title": "Acme Distributed Session & Cache Store",
  "dcterms:description": "Redis cluster for distributed session state, token revocation, and rate limiting.",
  "robos:engine": "redis",
  "robos:host": "redis-cluster.internal.acme.corp",
  "robos:port": 6379,
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
        "@id": "urn:robos:db:acme-session-redis",
        "@type": [
            "oslc_am:Resource",
            "robos:NoSQLDatabase",
            "robos:CacheStore"
        ],
        "dcterms:title": "Acme Distributed Session & Cache Store",
        "dcterms:description": "Redis cluster for distributed session state, token revocation, and rate limiting.",
        "robos:engine": "redis",
        "robos:host": "redis-cluster.internal.acme.corp",
        "robos:port": 6379,
        "robos:package": "core-platform",
        "robos:namespace": "robos.platform"
    }
  ],
}));

console.log("Conforms:", result.conforms); // Expected: true
```