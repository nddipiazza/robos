---
title: Architecture Decision Record
layout: default
parent: Documentation & Diagrams (robos.docs)
grand_parent: KGraph Schemas
nav_order: 3
permalink: /schemas/documentation/architecture-decision-record.html
---

# Schema: `robos:ArchitectureDecisionRecord`
{: .no_toc }

Formal W3C SHACL constraint shape and OSLC JSON-LD specification for `robos:ArchitectureDecisionRecord` in the `documentation` package store.
{: .fs-6 .fw-300 }

## Table of contents
{: .no_toc .text-delta }

1. TOC
{:toc}

---

## Specification Metadata

- **RDF / OWL Class**: `robos:ArchitectureDecisionRecord`
- **Aliases / Target Classes**: `robos:ArchitectureDecisionRecord`, `robos:ADR`
- **SHACL Shape ID**: `urn:robos:shape:ArchitectureDecisionRecordShape`
- **Governing Package**: [Documentation & Diagrams (robos.docs)]({{ '/schemas/documentation.html' | relative_url }}) (`documentation`)
- **Namespace**: `robos.docs`
- **Upstream Schema Basis (Refers From)**: [https://schema.org/TechArticle](https://schema.org/TechArticle)

---

## Upstream Schema Basis (Refers From)

This RobOS schema is modeled after and directly expands upon the upstream canonical standard:
- **Canonical Reference**: [https://schema.org/TechArticle](https://schema.org/TechArticle)
- **Provenance & Alignment**: When autonomous agents generate, expand, or validate instances of `robos:ArchitectureDecisionRecord`, they MUST adhere to and base their output on this referred schema object, extending it with RobOS SDLC properties.

---

## Entity Relationship & Schema Context

<div style="margin: 1.5rem 0; padding: 1.25rem; background: #161b22; border: 1px solid #30363d; border-radius: 8px;">
  <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.75rem; flex-wrap: wrap; gap: 0.5rem;">
    <span style="font-size: 1.15rem; font-weight: 700; color: #38bdf8;">Architecture Decision Record</span>
    <span style="font-family: monospace; background: #121927; color: #00e5ff; border: 1px solid rgba(0, 229, 255, 0.4); padding: 0.2rem 0.6rem; border-radius: 6px; font-size: 0.85rem;">robos:ArchitectureDecisionRecord</span>
  </div>
  <p style="margin-bottom: 0.75rem; font-size: 0.92rem; color: #c9d1d9;">Governed by W3C SHACL shape <code>urn:robos:shape:ArchitectureDecisionRecordShape</code> within the <strong>Documentation & Diagrams (robos.docs)</strong> (<code>robos.docs</code>) package store.</p>
  <div style="display: flex; flex-wrap: wrap; gap: 0.5rem; margin-top: 0.5rem;">
    <span style="background: #0d1117; border: 1px solid #21262d; padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.8rem; color: #8b949e;"><code>dcterms:title</code></span>
    <span style="background: #0d1117; border: 1px solid #21262d; padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.8rem; color: #8b949e;"><code>robos:status</code></span>
    <span style="background: #0d1117; border: 1px solid #21262d; padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.8rem; color: #8b949e;"><code>robos:context</code></span>
    <span style="background: #0d1117; border: 1px solid #21262d; padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.8rem; color: #8b949e;"><code>robos:decision</code></span>
  </div>
</div>

---

## Property Constraints & SHACL Rules

| Property Path | Name | Multiplicity | Data Type | Constraint Rule / Validation Message |
|---|---|---|---|---|
| **`dcterms:title`** | Title / Display Name | `1..*` | `xsd:string` | Architecture Decision Record must have a title. |
| **`robos:status`** | Lifecycle Status | `1..*` | `xsd:string` | Architecture Decision Record must declare status (proposed, accepted, superseded, etc.). |
| **`robos:context`** | Decision Context | `1..*` | `xsd:string` | Architecture Decision Record must provide architectural context and problem statement. |
| **`robos:decision`** | Architectural Decision | `1..*` | `xsd:string` | Architecture Decision Record must state the architectural decision. |

---

## Canonical OSLC JSON-LD Example

```json
{
  "@id": "urn:robos:adr:001-modular-kgraph",
  "@type": [
    "oslc_am:Resource",
    "robos:ArchitectureDecisionRecord",
    "robos:ADR"
  ],
  "dcterms:title": "ADR-001: Modular Namespaced Knowledge Graph Architecture",
  "robos:adrNumber": "ADR-001",
  "robos:status": "accepted",
  "robos:context": "Monolithic JSON-LD knowledge graph files cause merge conflicts in multi-repo and multi-team environments.",
  "robos:decision": "Adopt modular, namespaced package stores (.robos/kgraphs/<pkg>/package.jsonld) with git-tag versioning and aggregated backward compatibility.",
  "robos:consequences": "Eliminates team collisions, isolates domains, and allows fine-grained GitOps diffing.",
  "robos:date": "2026-03-15",
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
        "@id": "urn:robos:adr:001-modular-kgraph",
        "@type": [
            "oslc_am:Resource",
            "robos:ArchitectureDecisionRecord",
            "robos:ADR"
        ],
        "dcterms:title": "ADR-001: Modular Namespaced Knowledge Graph Architecture",
        "robos:adrNumber": "ADR-001",
        "robos:status": "accepted",
        "robos:context": "Monolithic JSON-LD knowledge graph files cause merge conflicts in multi-repo and multi-team environments.",
        "robos:decision": "Adopt modular, namespaced package stores (.robos/kgraphs/<pkg>/package.jsonld) with git-tag versioning and aggregated backward compatibility.",
        "robos:consequences": "Eliminates team collisions, isolates domains, and allows fine-grained GitOps diffing.",
        "robos:date": "2026-03-15",
        "robos:hasFlowDiagram": "urn:robos:diagram:order-lifecycle-flow",
        "robos:package": "documentation",
        "robos:namespace": "robos.docs"
    }
  ],
}));

console.log("Conforms:", result.conforms); // Expected: true
```