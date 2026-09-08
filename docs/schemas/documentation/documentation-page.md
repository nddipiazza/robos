---
title: Documentation Page
layout: default
parent: Documentation & Diagrams (robos.docs)
grand_parent: KGraph Schemas
nav_order: 2
permalink: /schemas/documentation/documentation-page.html
---

# Schema: `robos:DocumentationPage`
{: .no_toc }

Formal W3C SHACL constraint shape and OSLC JSON-LD specification for `robos:DocumentationPage` in the `documentation` package store.
{: .fs-6 .fw-300 }

## Table of contents
{: .no_toc .text-delta }

1. TOC
{:toc}

---

## Specification Metadata

- **RDF / OWL Class**: `robos:DocumentationPage`
- **Aliases / Target Classes**: `robos:DocumentationPage`, `robos:DocArticle`
- **SHACL Shape ID**: `urn:robos:shape:DocumentationPageShape`
- **Governing Package**: [Documentation & Diagrams (robos.docs)]({{ '/schemas/documentation.html' | relative_url }}) (`documentation`)
- **Namespace**: `robos.docs`

---

## Entity Relationship & Schema Context

<div style="margin: 1.5rem 0; padding: 1.25rem; background: #161b22; border: 1px solid #30363d; border-radius: 8px;">
  <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.75rem; flex-wrap: wrap; gap: 0.5rem;">
    <span style="font-size: 1.15rem; font-weight: 700; color: #38bdf8;">Documentation Page</span>
    <span style="font-family: monospace; background: #121927; color: #00e5ff; border: 1px solid rgba(0, 229, 255, 0.4); padding: 0.2rem 0.6rem; border-radius: 6px; font-size: 0.85rem;">robos:DocumentationPage</span>
  </div>
  <p style="margin-bottom: 0.75rem; font-size: 0.92rem; color: #c9d1d9;">Governed by W3C SHACL shape <code>urn:robos:shape:DocumentationPageShape</code> within the <strong>Documentation & Diagrams (robos.docs)</strong> (<code>robos.docs</code>) package store.</p>
  <div style="display: flex; flex-wrap: wrap; gap: 0.5rem; margin-top: 0.5rem;">
    <span style="background: #0d1117; border: 1px solid #21262d; padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.8rem; color: #8b949e;"><code>dcterms:title</code></span>
    <span style="background: #0d1117; border: 1px solid #21262d; padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.8rem; color: #8b949e;"><code>robos:slug</code></span>
    <span style="background: #0d1117; border: 1px solid #21262d; padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.8rem; color: #8b949e;"><code>robos:docPath</code></span>
  </div>
</div>

---

## Property Constraints & SHACL Rules

| Property Path | Name | Multiplicity | Data Type | Constraint Rule / Validation Message |
|---|---|---|---|---|
| **`dcterms:title`** | Title / Display Name | `1..*` | `xsd:string` | Documentation Page must have a title. |
| **`robos:slug`** | URL / Document Slug | `1..*` | `xsd:string` | Documentation Page must declare a URL slug. |
| **`robos:docPath`** | Document File Path | `1..*` | `xsd:string` | Documentation Page must specify a relative markdown document path. |

---

## Canonical OSLC JSON-LD Example

```json
{
  "@id": "urn:robos:doc:sdlc-architecture-guide",
  "@type": [
    "oslc_am:Resource",
    "robos:DocumentationPage",
    "robos:DocArticle"
  ],
  "dcterms:title": "RobOS Living SDLC Architecture & Graph Guide",
  "robos:slug": "sdlc-architecture-guide",
  "dcterms:description": "Comprehensive reference on the dual-state knowledge graph, modular packages, and living doc synchronization.",
  "robos:docPath": "docs/knowledge-graph.md",
  "robos:category": "Architecture",
  "robos:hasFlowDiagram": "urn:robos:diagram:order-lifecycle-flow",
  "robos:package": "documentation",
  "robos:namespace": "robos.docs"
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
        "@id": "urn:robos:doc:sdlc-architecture-guide",
        "@type": [
            "oslc_am:Resource",
            "robos:DocumentationPage",
            "robos:DocArticle"
        ],
        "dcterms:title": "RobOS Living SDLC Architecture & Graph Guide",
        "robos:slug": "sdlc-architecture-guide",
        "dcterms:description": "Comprehensive reference on the dual-state knowledge graph, modular packages, and living doc synchronization.",
        "robos:docPath": "docs/knowledge-graph.md",
        "robos:category": "Architecture",
        "robos:hasFlowDiagram": "urn:robos:diagram:order-lifecycle-flow",
        "robos:package": "documentation",
        "robos:namespace": "robos.docs"
    }
  ],
}));

console.log("Conforms:", result.conforms); // Expected: true
```