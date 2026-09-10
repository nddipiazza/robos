---
title: Learning Lesson
layout: default
parent: eLearning Curriculums (robos.learning)
grand_parent: KGraph Schemas
nav_order: 4
permalink: /schemas/learning/learning-lesson.html
---

# Schema: `robos:LearningLesson`
{: .no_toc }

Formal W3C SHACL constraint shape and OSLC JSON-LD specification for `robos:LearningLesson` in the `learning` package store.
{: .fs-6 .fw-300 }

## Table of contents
{: .no_toc .text-delta }

1. TOC
{:toc}

---

## Specification Metadata

- **RDF / OWL Class**: `robos:LearningLesson`
- **Aliases / Target Classes**: `robos:LearningLesson`
- **SHACL Shape ID**: `urn:robos:shape:LearningLessonShape`
- **Governing Package**: [eLearning Curriculums (robos.learning)]({{ '/schemas/learning.html' | relative_url }}) (`learning`)
- **Namespace**: `robos.learning`
- **Schema.org Classification**: [https://schema.org/LearningResource](https://schema.org/LearningResource)
- **Domain De Facto Standard**: [https://schema.org/LearningResource](https://schema.org/LearningResource)
- **Upstream Schema Basis (Refers From)**: [https://schema.org/LearningResource](https://schema.org/LearningResource)

---

## Upstream Schema Basis (Refers From) & Global Standards Provenance

This RobOS schema is modeled after and directly aligns with two levels of global standards:
- **Universal Schema.org Class**: [https://schema.org/LearningResource](https://schema.org/LearningResource) (100% interoperability with search engines, web indexers, and general AI reasoning)
- **Specialized Domain Standard**: [https://schema.org/LearningResource](https://schema.org/LearningResource) (de facto standard for domain-specific ALM, BDD, or infrastructure operations)
- **Canonical Reference**: [https://schema.org/LearningResource](https://schema.org/LearningResource)
- **Agent Guidelines**: When autonomous agents generate, expand, or validate instances of `robos:LearningLesson`, they MUST adhere to and base their output on this referred schema object and universal Schema.org parent class, extending it with RobOS SDLC properties.

---

## Entity Relationship & Schema Context

<div style="margin: 1.5rem 0; padding: 1.25rem; background: #161b22; border: 1px solid #30363d; border-radius: 8px;">
  <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.75rem; flex-wrap: wrap; gap: 0.5rem;">
    <span style="font-size: 1.15rem; font-weight: 700; color: #38bdf8;">Learning Lesson</span>
    <span style="font-family: monospace; background: #121927; color: #00e5ff; border: 1px solid rgba(0, 229, 255, 0.4); padding: 0.2rem 0.6rem; border-radius: 6px; font-size: 0.85rem;">robos:LearningLesson</span>
  </div>
  <p style="margin-bottom: 0.75rem; font-size: 0.92rem; color: #c9d1d9;">Governed by W3C SHACL shape <code>urn:robos:shape:LearningLessonShape</code> within the <strong>eLearning Curriculums (robos.learning)</strong> (<code>robos.learning</code>) package store.</p>
  <div style="display: flex; flex-wrap: wrap; gap: 0.5rem; margin-top: 0.5rem;">
    <span style="background: #0d1117; border: 1px solid #21262d; padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.8rem; color: #8b949e;"><code>dcterms:title</code></span>
    <span style="background: #0d1117; border: 1px solid #21262d; padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.8rem; color: #8b949e;"><code>robos:module</code></span>
  </div>
</div>

---

## Property Constraints & SHACL Rules

| Property Path | Name | Multiplicity | Data Type | Constraint Rule / Validation Message |
|---|---|---|---|---|
| **`dcterms:title`** | Title / Display Name | `1..*` | `xsd:string` | Learning Lesson must have a title. |
| **`robos:module`** | Parent Learning Module | `1..*` | `URI (robos:LearningModule)` | Learning Lesson must link to parent learning module. |

---

## Canonical OSLC JSON-LD Example

```json
{
  "@id": "urn:robos:learning:learning-lesson-sample",
  "@type": [
    "robos:LearningLesson",
    "schema:LearningResource",
    "oslc:Resource"
  ],
  "dcterms:title": "Sample Learning Lesson",
  "dcterms:description": "Canonical reference instance for robos:LearningLesson.",
  "robos:package": "learning",
  "robos:namespace": "robos.learning",
  "robos:module": "urn:robos:module:sample-module",
  "robos:schemaOrgType": "https://schema.org/LearningResource",
  "robos:domainStandard": "https://schema.org/LearningResource",
  "robos:refersFrom": "https://schema.org/LearningResource"
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
        "@id": "urn:robos:learning:learning-lesson-sample",
        "@type": [
            "robos:LearningLesson",
            "schema:LearningResource",
            "oslc:Resource"
        ],
        "dcterms:title": "Sample Learning Lesson",
        "dcterms:description": "Canonical reference instance for robos:LearningLesson.",
        "robos:package": "learning",
        "robos:namespace": "robos.learning",
        "robos:module": "urn:robos:module:sample-module",
        "robos:schemaOrgType": "https://schema.org/LearningResource",
        "robos:domainStandard": "https://schema.org/LearningResource",
        "robos:refersFrom": "https://schema.org/LearningResource"
    }
  ],
}));

console.log("Conforms:", result.conforms); // Expected: true
```