---
title: Library
layout: default
parent: Applications (robos.apps)
grand_parent: KGraph Schemas
nav_order: 5
permalink: /schemas/applications/library.html
---

# Schema: `robos:Library`
{: .no_toc }

Formal W3C SHACL constraint shape and OSLC JSON-LD specification for `robos:Library` in the `applications` package store.
{: .fs-6 .fw-300 }

## Table of contents
{: .no_toc .text-delta }

1. TOC
{:toc}

---

## Specification Metadata

- **RDF / OWL Class**: `robos:Library`
- **Aliases / Target Classes**: `robos:Library`
- **SHACL Shape ID**: `urn:robos:shape:LibraryShape`
- **Governing Package**: [Applications (robos.apps)]({{ '/schemas/applications.html' | relative_url }}) (`applications`)
- **Namespace**: `robos.apps`

---

## Entity Relationship Diagram

```mermaid
graph LR
    ThisNode["Library<br/><code>robos:Library</code>"]:::primary
    classDef primary fill:#16243b,stroke:#00e5ff,stroke-width:2.5px,color:#ffffff;
    ThisNode -->|robos:repository| repository["repository"]
```

---

## Property Constraints & SHACL Rules

| Property Path | Name | Multiplicity | Data Type | Constraint Rule / Validation Message |
|---|---|---|---|---|
| **`dcterms:title`** | Title / Display Name | `1..*` | `xsd:string` | Library must have a title. |
| **`robos:repository`** | Git Repository | `1..*` | `xsd:string` | Library must define a repository. |
| **`robos:technology`** | Technology Stack | `1..*` | `xsd:string` | Library must specify technology stack. |

---

## Canonical OSLC JSON-LD Example

```json
{
  "@id": "urn:robos:applications:library-sample",
  "@type": [
    "robos:Library",
    "oslc:Resource"
  ],
  "dcterms:title": "Sample Library",
  "dcterms:description": "Canonical reference instance for robos:Library.",
  "robos:package": "applications",
  "robos:namespace": "robos.apps",
  "robos:repository": "github.com/acme/sample-repo",
  "robos:technology": "Node.js / TypeScript"
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
        "@id": "urn:robos:applications:library-sample",
        "@type": [
            "robos:Library",
            "oslc:Resource"
        ],
        "dcterms:title": "Sample Library",
        "dcterms:description": "Canonical reference instance for robos:Library.",
        "robos:package": "applications",
        "robos:namespace": "robos.apps",
        "robos:repository": "github.com/acme/sample-repo",
        "robos:technology": "Node.js / TypeScript"
    }
  ],
}));

console.log("Conforms:", result.conforms); // Expected: true
```