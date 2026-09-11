---
title: eLearning Course
layout: default
parent: eLearning Curriculums (robos.learning)
grand_parent: KGraph Schemas
nav_order: 1
permalink: /schemas/learning/elearning.html
---

# Schema: `robos:ELearning`
{: .no_toc }

Formal W3C SHACL constraint shape and OSLC JSON-LD specification for `robos:ELearning` in the `learning` package store.
{: .fs-6 .fw-300 }

## Table of contents
{: .no_toc .text-delta }

1. TOC
{:toc}

---

## Specification Metadata

- **RDF / OWL Class**: `robos:ELearning`
- **Aliases / Target Classes**: `robos:ELearning`
- **SHACL Shape ID**: `urn:robos:shape:ELearningShape`
- **Governing Package**: [eLearning Curriculums (robos.learning)]({{ '/schemas/learning.html' | relative_url }}) (`learning`)
- **Namespace**: `robos.learning`
- **Schema.org Classification**: [https://schema.org/Course](https://schema.org/Course)
- **Domain De Facto Standard**: [https://schema.org/Course](https://schema.org/Course)
- **Upstream Schema Basis (Refers From)**: [https://schema.org/Course](https://schema.org/Course)

---

## Upstream Schema Basis (Refers From) & Global Standards Provenance

This RobOS schema is modeled after and directly aligns with two levels of global standards:
- **Universal Schema.org Class**: [https://schema.org/Course](https://schema.org/Course) (100% interoperability with search engines, web indexers, and general AI reasoning)
- **Specialized Domain Standard**: [https://schema.org/Course](https://schema.org/Course) (de facto standard for domain-specific ALM, BDD, or infrastructure operations)
- **Canonical Reference**: [https://schema.org/Course](https://schema.org/Course)
- **Agent Guidelines**: When autonomous agents generate, expand, or validate instances of `robos:ELearning`, they MUST adhere to and base their output on this referred schema object and universal Schema.org parent class, extending it with RobOS SDLC properties.

---

## Entity Relationship & Schema Context

<div style="margin: 1.5rem 0; padding: 1.25rem; background: #161b22; border: 1px solid #30363d; border-radius: 8px;">
  <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.75rem; flex-wrap: wrap; gap: 0.5rem;">
    <span style="font-size: 1.15rem; font-weight: 700; color: #38bdf8;">eLearning Course</span>
    <span style="font-family: monospace; background: #121927; color: #00e5ff; border: 1px solid rgba(0, 229, 255, 0.4); padding: 0.2rem 0.6rem; border-radius: 6px; font-size: 0.85rem;">robos:ELearning</span>
  </div>
  <p style="margin-bottom: 0.75rem; font-size: 0.92rem; color: #c9d1d9;">Governed by W3C SHACL shape <code>urn:robos:shape:ELearningShape</code> within the <strong>eLearning Curriculums (robos.learning)</strong> (<code>robos.learning</code>) package store.</p>
  <div style="display: flex; flex-wrap: wrap; gap: 0.5rem; margin-top: 0.5rem;">
    <span style="background: #0d1117; border: 1px solid #21262d; padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.8rem; color: #8b949e;"><code>dcterms:title</code></span>
    <span style="background: #0d1117; border: 1px solid #21262d; padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.8rem; color: #8b949e;"><code>robos:topic</code></span>
    <span style="background: #0d1117; border: 1px solid #21262d; padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.8rem; color: #8b949e;"><code>robos:modules</code></span>
    <span style="background: #0d1117; border: 1px solid #21262d; padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.8rem; color: #8b949e;"><code>robos:gitopsFile</code></span>
  </div>
</div>

---

**RobOS classification:** Learning & assessment. These RobOS-owned codes use Schema.org CategoryCode vocabulary.

## Property Constraints & SHACL Rules

| Property Path | Name | Multiplicity | Data Type | Classification | Constraint Rule / Validation Message |
|---|---|---|---|---|---|
| **`dcterms:title`** | Title / Display Name | `1..*` | `xsd:string` | Services & processing, Applications & entry points, Contracts & data models, Data stores & messaging, Libraries & build systems, Infrastructure & delivery, Organization & people, Projects & work items, Source control & artifacts, Agents & MCP, Documentation & decisions, Learning & assessment, Testing & behavior | eLearning course must have a title. |
| **`robos:topic`** | Knowledge Domain Topic | `1..*` | `xsd:string` | Data stores & messaging, Learning & assessment | eLearning course must specify a topic domain. |
| **`robos:modules`** | Learning Modules | `1..*` | `Array<robos:LearningModule>` | Learning & assessment | eLearning course must have at least one learning module. |
| **`robos:gitopsFile`** | GitOps Declarative File | `1..*` | `xsd:string` | Learning & assessment | eLearning course must declare its GitOps file location (.robos/elearning.yaml). |

---

## Canonical OSLC JSON-LD Example

```json
{
  "@id": "urn:robos:elearning:course:sdlc-fundamentals",
  "@type": [
    "oslc_am:Resource",
    "robos:ELearningCourse",
    "robos:ELearning",
    "schema:Course"
  ],
  "dcterms:title": "RobOS Dual-State SDLC Fundamentals",
  "dcterms:description": "Mastering the knowledge graph, branch diffing, and automated E2E verification in RobOS.",
  "robos:topic": "SDLC Fundamentals",
  "robos:level": "Intermediate",
  "robos:modulesCount": 4,
  "robos:gitopsFile": ".robos/elearning.yaml",
  "robos:modules": [
    {
      "title": "Module 1: Dual-State Architecture",
      "labFile": "labs/01-dual-state.md"
    }
  ],
  "robos:package": "learning",
  "robos:namespace": "robos.learning",
  "robos:schemaOrgType": "https://schema.org/Course",
  "robos:domainStandard": "https://schema.org/Course"
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
        "@id": "urn:robos:elearning:course:sdlc-fundamentals",
        "@type": [
            "oslc_am:Resource",
            "robos:ELearningCourse",
            "robos:ELearning",
            "schema:Course"
        ],
        "dcterms:title": "RobOS Dual-State SDLC Fundamentals",
        "dcterms:description": "Mastering the knowledge graph, branch diffing, and automated E2E verification in RobOS.",
        "robos:topic": "SDLC Fundamentals",
        "robos:level": "Intermediate",
        "robos:modulesCount": 4,
        "robos:gitopsFile": ".robos/elearning.yaml",
        "robos:modules": [
            {
                "title": "Module 1: Dual-State Architecture",
                "labFile": "labs/01-dual-state.md"
            }
        ],
        "robos:package": "learning",
        "robos:namespace": "robos.learning",
        "robos:schemaOrgType": "https://schema.org/Course",
        "robos:domainStandard": "https://schema.org/Course"
    }
  ],
}));

console.log("Conforms:", result.conforms); // Expected: true
```