---
title: Requirement
layout: default
parent: Services & Contracts (robos.services)
grand_parent: KGraph Schemas
nav_order: 3
permalink: /schemas/services/requirement.html
---

# Schema: `oslc_rm:Requirement`
{: .no_toc }

Formal W3C SHACL constraint shape and OSLC JSON-LD specification for `oslc_rm:Requirement` in the `services` package store.
{: .fs-6 .fw-300 }

## Table of contents
{: .no_toc .text-delta }

1. TOC
{:toc}

---

## Specification Metadata

- **RDF / OWL Class**: `oslc_rm:Requirement`
- **Aliases / Target Classes**: `oslc_rm:Requirement`
- **SHACL Shape ID**: `urn:robos:shape:RequirementShape`
- **Governing Package**: [Services & Contracts (robos.services)]({{ '/schemas/services.html' | relative_url }}) (`services`)
- **Namespace**: `robos.services`

---

## Entity Relationship Diagram

```mermaid
graph LR
    ThisNode["Requirement<br/><code>oslc_rm:Requirement</code>"]:::primary
    classDef primary fill:#16243b,stroke:#00e5ff,stroke-width:2.5px,color:#ffffff;
```

---

## Property Constraints & SHACL Rules

| Property Path | Name | Multiplicity | Data Type | Constraint Rule / Validation Message |
|---|---|---|---|---|
| **`dcterms:title`** | Title / Display Name | `1..*` | `xsd:string` | Requirement must have a title. |
| **`robos:featureFile`** | Gherkin Feature File | `1..*` | `xsd:string` | Requirement must link to a Gherkin .feature file. |

---

## Canonical OSLC JSON-LD Example

```json
{
  "@id": "urn:robos:services:requirement-sample",
  "@type": [
    "oslc_rm:Requirement",
    "oslc:Resource"
  ],
  "dcterms:title": "Sample Requirement",
  "dcterms:description": "Canonical reference instance for oslc_rm:Requirement.",
  "robos:package": "services",
  "robos:namespace": "robos.services",
  "robos:featureFile": "tests/bdd/sample.feature"
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
        "@id": "urn:robos:services:requirement-sample",
        "@type": [
            "oslc_rm:Requirement",
            "oslc:Resource"
        ],
        "dcterms:title": "Sample Requirement",
        "dcterms:description": "Canonical reference instance for oslc_rm:Requirement.",
        "robos:package": "services",
        "robos:namespace": "robos.services",
        "robos:featureFile": "tests/bdd/sample.feature"
    }
  ],
}));

console.log("Conforms:", result.conforms); // Expected: true
```