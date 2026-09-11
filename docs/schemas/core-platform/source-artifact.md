---
title: Source Artifact
layout: default
parent: Core Platform (robos.core)
grand_parent: KGraph Schemas
nav_order: 21
permalink: /schemas/core-platform/source-artifact.html
---

# Schema: `robos:SourceArtifact`
{: .no_toc }

Formal W3C SHACL constraint shape and OSLC JSON-LD specification for `robos:SourceArtifact` in the `core-platform` package store.
{: .fs-6 .fw-300 }

## Table of contents
{: .no_toc .text-delta }

1. TOC
{:toc}

---

## Specification Metadata

- **RDF / OWL Class**: `robos:SourceArtifact`
- **Aliases / Target Classes**: `robos:SourceArtifact`
- **SHACL Shape ID**: `robos:SourceArtifactShape`
- **Governing Package**: [Core Platform (robos.core)]({{ '/schemas/core-platform.html' | relative_url }}) (`core-platform`)
- **Namespace**: `robos.platform`
- **Schema.org Classification**: [https://schema.org/CreativeWork](https://schema.org/CreativeWork)
- **Domain De Facto Standard**: [https://schema.org/CreativeWork](https://schema.org/CreativeWork)
- **Upstream Schema Basis (Refers From)**: [https://schema.org/CreativeWork](https://schema.org/CreativeWork)

---

## Upstream Schema Basis (Refers From) & Global Standards Provenance

This RobOS schema is modeled after and directly aligns with two levels of global standards:
- **Universal Schema.org Class**: [https://schema.org/CreativeWork](https://schema.org/CreativeWork) (100% interoperability with search engines, web indexers, and general AI reasoning)
- **Specialized Domain Standard**: [https://schema.org/CreativeWork](https://schema.org/CreativeWork) (de facto standard for domain-specific ALM, BDD, or infrastructure operations)
- **Canonical Reference**: [https://schema.org/CreativeWork](https://schema.org/CreativeWork)
- **Agent Guidelines**: When autonomous agents generate, expand, or validate instances of `robos:SourceArtifact`, they MUST adhere to and base their output on this referred schema object and universal Schema.org parent class, extending it with RobOS SDLC properties.

---

## Entity Relationship & Schema Context

<div style="margin: 1.5rem 0; padding: 1.25rem; background: #161b22; border: 1px solid #30363d; border-radius: 8px;">
  <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.75rem; flex-wrap: wrap; gap: 0.5rem;">
    <span style="font-size: 1.15rem; font-weight: 700; color: #38bdf8;">Source Artifact</span>
    <span style="font-family: monospace; background: #121927; color: #00e5ff; border: 1px solid rgba(0, 229, 255, 0.4); padding: 0.2rem 0.6rem; border-radius: 6px; font-size: 0.85rem;">robos:SourceArtifact</span>
  </div>
  <p style="margin-bottom: 0.75rem; font-size: 0.92rem; color: #c9d1d9;">Governed by W3C SHACL shape <code>robos:SourceArtifactShape</code> within the <strong>Core Platform (robos.core)</strong> (<code>robos.platform</code>) package store.</p>
  <div style="display: flex; flex-wrap: wrap; gap: 0.5rem; margin-top: 0.5rem;">
    <span style="background: #0d1117; border: 1px solid #21262d; padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.8rem; color: #8b949e;"><code>dcterms:title</code></span>
    <span style="background: #0d1117; border: 1px solid #21262d; padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.8rem; color: #8b949e;"><code>robos:sourcePath</code></span>
    <span style="background: #0d1117; border: 1px solid #21262d; padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.8rem; color: #8b949e;"><code>robos:sourceKind</code></span>
    <span style="background: #0d1117; border: 1px solid #21262d; padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.8rem; color: #8b949e;"><code>robos:inRepository</code></span>
    <span style="background: #0d1117; border: 1px solid #21262d; padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.8rem; color: #8b949e;"><code>robos:evidence</code></span>
  </div>
</div>

---

## Property Constraints & SHACL Rules

| Property Path | Name | Multiplicity | Data Type | Constraint Rule / Validation Message |
|---|---|---|---|---|
| **`dcterms:title`** | Title / Display Name | `1..*` | `xsd:string` | Source artifact needs a title. |
| **`robos:sourcePath`** | sourcePath | `1..*` | `xsd:string` | Source artifact needs a portable source path. |
| **`robos:sourceKind`** | sourceKind | `1..*` | `xsd:string` | Source artifact needs a declared kind. |
| **`robos:inRepository`** | inRepository | `1..*` | `xsd:string` | Source artifact needs its repository reference. |
| **`robos:evidence`** | evidence | `1..*` | `xsd:string` | Source artifact needs source evidence. |

---

## Canonical OSLC JSON-LD Example

```json
{
  "@id": "urn:robos:source:graph-workspace",
  "@type": [
    "robos:SourceArtifact",
    "schema:CreativeWork"
  ],
  "dcterms:title": "External graph workspace and revision store",
  "robos:package": "core-platform",
  "robos:sourcePath": "packages/robos-graph/lib/graph-workspace.js",
  "robos:sourceKind": "implementation",
  "robos:inRepository": {
    "@id": "urn:robos:source:workspace"
  },
  "robos:evidence": [
    {
      "repository": "robos",
      "path": "packages/robos-graph/lib/graph-workspace.js",
      "line": 1
    }
  ],
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
        "@id": "urn:robos:source:graph-workspace",
        "@type": [
            "robos:SourceArtifact",
            "schema:CreativeWork"
        ],
        "dcterms:title": "External graph workspace and revision store",
        "robos:package": "core-platform",
        "robos:sourcePath": "packages/robos-graph/lib/graph-workspace.js",
        "robos:sourceKind": "implementation",
        "robos:inRepository": {
            "@id": "urn:robos:source:workspace"
        },
        "robos:evidence": [
            {
                "repository": "robos",
                "path": "packages/robos-graph/lib/graph-workspace.js",
                "line": 1
            }
        ],
        "robos:namespace": "robos.platform"
    }
  ],
}));

console.log("Conforms:", result.conforms); // Expected: true
```