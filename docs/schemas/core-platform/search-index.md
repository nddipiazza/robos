---
title: Search Index
layout: default
parent: Core Platform (robos.core)
grand_parent: KGraph Schemas
nav_order: 22
permalink: /schemas/core-platform/search-index.html
---

# Schema: `robos:SearchIndex`
{: .no_toc }

Formal W3C SHACL constraint shape and OSLC JSON-LD specification for `robos:SearchIndex` in the `core-platform` package store.
{: .fs-6 .fw-300 }

## Table of contents
{: .no_toc .text-delta }

1. TOC
{:toc}

---

## Specification Metadata

- **RDF / OWL Class**: `robos:SearchIndex`
- **Aliases / Target Classes**: `robos:SearchIndex`
- **SHACL Shape ID**: `urn:robos:shape:SearchIndexShape`
- **Governing Package**: [Core Platform (robos.core)]({{ '/schemas/core-platform.html' | relative_url }}) (`core-platform`)
- **Namespace**: `robos.platform`
- **Schema.org Classification**: [https://schema.org/DataStore](https://schema.org/DataStore)
- **Domain De Facto Standard**: [https://schema.org/DataStore](https://schema.org/DataStore)
- **Upstream Schema Basis (Refers From)**: [https://schema.org/DataStore](https://schema.org/DataStore)

---

## Upstream Schema Basis (Refers From) & Global Standards Provenance

This RobOS schema is modeled after and directly aligns with two levels of global standards:
- **Universal Schema.org Class**: [https://schema.org/DataStore](https://schema.org/DataStore) (100% interoperability with search engines, web indexers, and general AI reasoning)
- **Specialized Domain Standard**: [https://schema.org/DataStore](https://schema.org/DataStore) (de facto standard for enterprise search and information retrieval stores)
- **Canonical Reference**: [https://schema.org/DataStore](https://schema.org/DataStore)
- **Agent Guidelines**: When autonomous agents generate, expand, or validate instances of `robos:SearchIndex`, they MUST adhere to and base their output on this referred schema object and universal Schema.org parent class, extending it with RobOS SDLC properties.

---

## Entity Relationship & Schema Context

<div style="margin: 1.5rem 0; padding: 1.25rem; background: #161b22; border: 1px solid #30363d; border-radius: 8px;">
  <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.75rem; flex-wrap: wrap; gap: 0.5rem;">
    <span style="font-size: 1.15rem; font-weight: 700; color: #38bdf8;">Search Index</span>
    <span style="font-family: monospace; background: #121927; color: #00e5ff; border: 1px solid rgba(0, 229, 255, 0.4); padding: 0.2rem 0.6rem; border-radius: 6px; font-size: 0.85rem;">robos:SearchIndex</span>
  </div>
  <p style="margin-bottom: 0.75rem; font-size: 0.92rem; color: #c9d1d9;">Governed by W3C SHACL shape <code>urn:robos:shape:SearchIndexShape</code> within the <strong>Core Platform (robos.core)</strong> (<code>robos.platform</code>) package store.</p>
  <div style="display: flex; flex-wrap: wrap; gap: 0.5rem; margin-top: 0.5rem;">
    <span style="background: #0d1117; border: 1px solid #21262d; padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.8rem; color: #8b949e;"><code>dcterms:title</code></span>
    <span style="background: #0d1117; border: 1px solid #21262d; padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.8rem; color: #8b949e;"><code>robos:engine</code></span>
  </div>
</div>

---

**RobOS classification:** Data stores & messaging. These RobOS-owned codes use Schema.org CategoryCode vocabulary.

## Property Constraints & SHACL Rules

| Property Path | Name | Multiplicity | Data Type | Classification | Constraint Rule / Validation Message |
|---|---|---|---|---|---|
| **`dcterms:title`** | Title / Display Name | `1..*` | `xsd:string` | Services & processing, Data stores & messaging | Search Index must have a title or display name. |
| **`robos:engine`** | Search Engine | `1..*` | `xsd:string` | Data stores & messaging, Agents & MCP | Search Index must declare its engine (luxir, solr, elasticsearch, opensearch). |

---

## Canonical OSLC JSON-LD Example

```json
{
  "@id": "urn:robos:search:luxir-kgraph-index",
  "@type": [
    "oslc_am:Resource",
    "robos:SearchIndex",
    "schema:DataStore"
  ],
  "dcterms:title": "Luxir RobOS KGraph Hybrid Search Index",
  "dcterms:description": "High-performance C++ embedded search index indexing AST symbols, contracts, and evidence-backed file nodes.",
  "robos:engine": "luxir",
  "robos:status": "experimental",
  "robos:productionReady": false,
  "robos:endpoint": "http://127.0.0.1:8983",
  "robos:package": "core-platform",
  "robos:namespace": "robos.platform",
  "robos:schemaOrgType": "https://schema.org/DataStore",
  "robos:domainStandard": "https://schema.org/DataStore"
}
```
