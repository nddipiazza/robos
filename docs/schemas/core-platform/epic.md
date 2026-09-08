---
title: Epic
layout: default
parent: Core Platform (robos.core)
grand_parent: KGraph Schemas
nav_order: 2
permalink: /schemas/core-platform/epic.html
---

# Schema: `robos:Epic`
{: .no_toc }

Formal W3C SHACL constraint shape and OSLC JSON-LD specification for `robos:Epic` in the `core-platform` package store.
{: .fs-6 .fw-300 }

## Table of contents
{: .no_toc .text-delta }

1. TOC
{:toc}

---

## Specification Metadata

- **RDF / OWL Class**: `robos:Epic`
- **Aliases / Target Classes**: `robos:Epic`
- **SHACL Shape ID**: `urn:robos:shape:EpicShape`
- **Governing Package**: [Core Platform (robos.core)]({{ '/schemas/core-platform.html' | relative_url }}) (`core-platform`)
- **Namespace**: `robos.platform`

---

## Entity Relationship Diagram

```mermaid
graph LR
    ThisNode["Epic<br/><code>robos:Epic</code>"]:::primary
    classDef primary fill:#16243b,stroke:#00e5ff,stroke-width:2.5px,color:#ffffff;
```

---

## Property Constraints & SHACL Rules

| Property Path | Name | Multiplicity | Data Type | Constraint Rule / Validation Message |
|---|---|---|---|---|
| **`dcterms:title`** | Title / Display Name | `1..*` | `xsd:string` | Epic must have a title. |

---

## Canonical OSLC JSON-LD Example

```json
{
  "@id": "urn:robos:core-platform:epic-sample",
  "@type": [
    "robos:Epic",
    "oslc:Resource"
  ],
  "dcterms:title": "Sample Epic",
  "dcterms:description": "Canonical reference instance for robos:Epic.",
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
        "@id": "urn:robos:core-platform:epic-sample",
        "@type": [
            "robos:Epic",
            "oslc:Resource"
        ],
        "dcterms:title": "Sample Epic",
        "dcterms:description": "Canonical reference instance for robos:Epic.",
        "robos:package": "core-platform",
        "robos:namespace": "robos.platform"
    }
  ],
}));

console.log("Conforms:", result.conforms); // Expected: true
```