---
title: Curriculum Definition
layout: default
parent: Core Platform (robos.core)
grand_parent: KGraph Schemas
nav_order: 18
permalink: /schemas/core-platform/curriculum-definition.html
---

# Schema: `robos:CurriculumDefinition`
{: .no_toc }

Formal W3C SHACL constraint shape and OSLC JSON-LD specification for `robos:CurriculumDefinition` in the `core-platform` package store.
{: .fs-6 .fw-300 }

## Table of contents
{: .no_toc .text-delta }

1. TOC
{:toc}

---

## Specification Metadata

- **RDF / OWL Class**: `robos:CurriculumDefinition`
- **Aliases / Target Classes**: `robos:CurriculumDefinition`
- **SHACL Shape ID**: `robos:CurriculumDefinitionShape`
- **Governing Package**: [Core Platform (robos.core)]({{ '/schemas/core-platform.html' | relative_url }}) (`core-platform`)
- **Namespace**: `robos.platform`
- **Schema.org Classification**: [https://schema.org/Course](https://schema.org/Course)
- **Domain De Facto Standard**: [https://schema.org/Course](https://schema.org/Course)
- **Upstream Schema Basis (Refers From)**: [https://schema.org/Course](https://schema.org/Course)

---

## Upstream Schema Basis (Refers From) & Global Standards Provenance

This RobOS schema is modeled after and directly aligns with two levels of global standards:
- **Universal Schema.org Class**: [https://schema.org/Course](https://schema.org/Course) (100% interoperability with search engines, web indexers, and general AI reasoning)
- **Specialized Domain Standard**: [https://schema.org/Course](https://schema.org/Course) (de facto standard for domain-specific ALM, BDD, or infrastructure operations)
- **Canonical Reference**: [https://schema.org/Course](https://schema.org/Course)
- **Agent Guidelines**: When autonomous agents generate, expand, or validate instances of `robos:CurriculumDefinition`, they MUST adhere to and base their output on this referred schema object and universal Schema.org parent class, extending it with RobOS SDLC properties.

---

## Entity Relationship & Schema Context

<div style="margin: 1.5rem 0; padding: 1.25rem; background: #161b22; border: 1px solid #30363d; border-radius: 8px;">
  <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.75rem; flex-wrap: wrap; gap: 0.5rem;">
    <span style="font-size: 1.15rem; font-weight: 700; color: #38bdf8;">Curriculum Definition</span>
    <span style="font-family: monospace; background: #121927; color: #00e5ff; border: 1px solid rgba(0, 229, 255, 0.4); padding: 0.2rem 0.6rem; border-radius: 6px; font-size: 0.85rem;">robos:CurriculumDefinition</span>
  </div>
  <p style="margin-bottom: 0.75rem; font-size: 0.92rem; color: #c9d1d9;">Governed by W3C SHACL shape <code>robos:CurriculumDefinitionShape</code> within the <strong>Core Platform (robos.core)</strong> (<code>robos.platform</code>) package store.</p>
  <div style="display: flex; flex-wrap: wrap; gap: 0.5rem; margin-top: 0.5rem;">
    <span style="background: #0d1117; border: 1px solid #21262d; padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.8rem; color: #8b949e;"><code>dcterms:title</code></span>
    <span style="background: #0d1117; border: 1px solid #21262d; padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.8rem; color: #8b949e;"><code>robos:sourcePath</code></span>
    <span style="background: #0d1117; border: 1px solid #21262d; padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.8rem; color: #8b949e;"><code>robos:evidence</code></span>
  </div>
</div>

---

## Property Constraints & SHACL Rules

| Property Path | Name | Multiplicity | Data Type | Constraint Rule / Validation Message |
|---|---|---|---|---|
| **`dcterms:title`** | Title / Display Name | `1..*` | `xsd:string` | Curriculum needs a title. |
| **`robos:sourcePath`** | sourcePath | `1..*` | `xsd:string` | Curriculum needs its source document. |
| **`robos:evidence`** | evidence | `1..*` | `xsd:string` | Curriculum needs source evidence. |

---

## Canonical OSLC JSON-LD Example

```json
{
  "@id": "urn:robos:core-platform:curriculum-definition-sample",
  "@type": [
    "robos:CurriculumDefinition",
    "schema:Course",
    "oslc:Resource"
  ],
  "dcterms:title": "Sample Curriculum Definition",
  "dcterms:description": "Canonical reference instance for robos:CurriculumDefinition.",
  "robos:package": "core-platform",
  "robos:namespace": "robos.platform",
  "robos:schemaOrgType": "https://schema.org/Course",
  "robos:domainStandard": "https://schema.org/Course",
  "robos:refersFrom": "https://schema.org/Course"
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
        "@id": "urn:robos:core-platform:curriculum-definition-sample",
        "@type": [
            "robos:CurriculumDefinition",
            "schema:Course",
            "oslc:Resource"
        ],
        "dcterms:title": "Sample Curriculum Definition",
        "dcterms:description": "Canonical reference instance for robos:CurriculumDefinition.",
        "robos:package": "core-platform",
        "robos:namespace": "robos.platform",
        "robos:schemaOrgType": "https://schema.org/Course",
        "robos:domainStandard": "https://schema.org/Course",
        "robos:refersFrom": "https://schema.org/Course"
    }
  ],
}));

console.log("Conforms:", result.conforms); // Expected: true
```