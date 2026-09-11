---
title: Hands On Lab
layout: default
parent: eLearning Curriculums (robos.learning)
grand_parent: KGraph Schemas
nav_order: 5
permalink: /schemas/learning/hands-on-lab.html
---

# Schema: `robos:HandsOnLab`
{: .no_toc }

Formal W3C SHACL constraint shape and OSLC JSON-LD specification for `robos:HandsOnLab` in the `learning` package store.
{: .fs-6 .fw-300 }

## Table of contents
{: .no_toc .text-delta }

1. TOC
{:toc}

---

## Specification Metadata

- **RDF / OWL Class**: `robos:HandsOnLab`
- **Aliases / Target Classes**: `robos:HandsOnLab`
- **SHACL Shape ID**: `urn:robos:shape:HandsOnLabShape`
- **Governing Package**: [eLearning Curriculums (robos.learning)]({{ '/schemas/learning.html' | relative_url }}) (`learning`)
- **Namespace**: `robos.learning`
- **Schema.org Classification**: [https://schema.org/ExercisePlan](https://schema.org/ExercisePlan)
- **Domain De Facto Standard**: [https://schema.org/ExercisePlan](https://schema.org/ExercisePlan)
- **Upstream Schema Basis (Refers From)**: [https://schema.org/ExercisePlan](https://schema.org/ExercisePlan)

---

## Upstream Schema Basis (Refers From) & Global Standards Provenance

This RobOS schema is modeled after and directly aligns with two levels of global standards:
- **Universal Schema.org Class**: [https://schema.org/ExercisePlan](https://schema.org/ExercisePlan) (100% interoperability with search engines, web indexers, and general AI reasoning)
- **Specialized Domain Standard**: [https://schema.org/ExercisePlan](https://schema.org/ExercisePlan) (de facto standard for domain-specific ALM, BDD, or infrastructure operations)
- **Canonical Reference**: [https://schema.org/ExercisePlan](https://schema.org/ExercisePlan)
- **Agent Guidelines**: When autonomous agents generate, expand, or validate instances of `robos:HandsOnLab`, they MUST adhere to and base their output on this referred schema object and universal Schema.org parent class, extending it with RobOS SDLC properties.

---

## Entity Relationship & Schema Context

<div style="margin: 1.5rem 0; padding: 1.25rem; background: #161b22; border: 1px solid #30363d; border-radius: 8px;">
  <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.75rem; flex-wrap: wrap; gap: 0.5rem;">
    <span style="font-size: 1.15rem; font-weight: 700; color: #38bdf8;">Hands On Lab</span>
    <span style="font-family: monospace; background: #121927; color: #00e5ff; border: 1px solid rgba(0, 229, 255, 0.4); padding: 0.2rem 0.6rem; border-radius: 6px; font-size: 0.85rem;">robos:HandsOnLab</span>
  </div>
  <p style="margin-bottom: 0.75rem; font-size: 0.92rem; color: #c9d1d9;">Governed by W3C SHACL shape <code>urn:robos:shape:HandsOnLabShape</code> within the <strong>eLearning Curriculums (robos.learning)</strong> (<code>robos.learning</code>) package store.</p>
  <div style="display: flex; flex-wrap: wrap; gap: 0.5rem; margin-top: 0.5rem;">
    <span style="background: #0d1117; border: 1px solid #21262d; padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.8rem; color: #8b949e;"><code>dcterms:title</code></span>
    <span style="background: #0d1117; border: 1px solid #21262d; padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.8rem; color: #8b949e;"><code>robos:labFile</code></span>
    <span style="background: #0d1117; border: 1px solid #21262d; padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.8rem; color: #8b949e;"><code>robos:module</code></span>
  </div>
</div>

---

**RobOS classification:** Learning & assessment. These RobOS-owned codes use Schema.org CategoryCode vocabulary.

## Property Constraints & SHACL Rules

| Property Path | Name | Multiplicity | Data Type | Classification | Constraint Rule / Validation Message |
|---|---|---|---|---|---|
| **`dcterms:title`** | Title / Display Name | `1..*` | `xsd:string` | Services & processing, Applications & entry points, Contracts & data models, Data stores & messaging, Libraries & build systems, Infrastructure & delivery, Organization & people, Projects & work items, Source control & artifacts, Agents & MCP, Documentation & decisions, Learning & assessment, Testing & behavior | Hands-on Lab must have a title. |
| **`robos:labFile`** | Hands-on Lab Guide File | `1..*` | `xsd:string` | Learning & assessment | Hands-on Lab must specify lab guide file path. |
| **`robos:module`** | Parent Learning Module | `1..*` | `URI (robos:LearningModule)` | Learning & assessment | Hands-on Lab must link to parent learning module. |

---

## Canonical OSLC JSON-LD Example

```json
{
  "@id": "urn:robos:learning:hands-on-lab-sample",
  "@type": [
    "robos:HandsOnLab",
    "schema:ExercisePlan",
    "oslc:Resource"
  ],
  "dcterms:title": "Sample Hands On Lab",
  "dcterms:description": "Canonical reference instance for robos:HandsOnLab.",
  "robos:package": "learning",
  "robos:namespace": "robos.learning",
  "robos:labFile": "labs/sample-lab.md",
  "robos:module": "urn:robos:module:sample-module",
  "robos:schemaOrgType": "https://schema.org/ExercisePlan",
  "robos:domainStandard": "https://schema.org/ExercisePlan",
  "robos:refersFrom": "https://schema.org/ExercisePlan"
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
        "@id": "urn:robos:learning:hands-on-lab-sample",
        "@type": [
            "robos:HandsOnLab",
            "schema:ExercisePlan",
            "oslc:Resource"
        ],
        "dcterms:title": "Sample Hands On Lab",
        "dcterms:description": "Canonical reference instance for robos:HandsOnLab.",
        "robos:package": "learning",
        "robos:namespace": "robos.learning",
        "robos:labFile": "labs/sample-lab.md",
        "robos:module": "urn:robos:module:sample-module",
        "robos:schemaOrgType": "https://schema.org/ExercisePlan",
        "robos:domainStandard": "https://schema.org/ExercisePlan",
        "robos:refersFrom": "https://schema.org/ExercisePlan"
    }
  ],
}));

console.log("Conforms:", result.conforms); // Expected: true
```