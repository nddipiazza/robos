---
title: Front End App
layout: default
parent: Applications (robos.apps)
grand_parent: KGraph Schemas
nav_order: 6
permalink: /schemas/applications/front-end-app.html
---

# Schema: `robos:FrontEndApp`
{: .no_toc }

Formal W3C SHACL constraint shape and OSLC JSON-LD specification for `robos:FrontEndApp` in the `applications` package store.
{: .fs-6 .fw-300 }

## Table of contents
{: .no_toc .text-delta }

1. TOC
{:toc}

---

## Specification Metadata

- **RDF / OWL Class**: `robos:FrontEndApp`
- **Aliases / Target Classes**: `robos:FrontEndApp`
- **SHACL Shape ID**: `urn:robos:shape:FrontEndAppShape`
- **Governing Package**: [Applications (robos.apps)]({{ '/schemas/applications.html' | relative_url }}) (`applications`)
- **Namespace**: `robos.apps`

---

## Entity Relationship Diagram

```mermaid
graph LR
    ThisNode["FrontEndApp<br/><code>robos:FrontEndApp</code>"]:::primary
    classDef primary fill:#16243b,stroke:#00e5ff,stroke-width:2.5px,color:#ffffff;
    ThisNode -->|robos:repository| repository["repository"]
```

---

## Property Constraints & SHACL Rules

| Property Path | Name | Multiplicity | Data Type | Constraint Rule / Validation Message |
|---|---|---|---|---|
| **`dcterms:title`** | Title / Display Name | `1..*` | `xsd:string` | Front End App must have a title. |
| **`robos:repository`** | Git Repository | `1..*` | `xsd:string` | Front End App must define a repository. |
| **`robos:technology`** | Technology Stack | `1..*` | `xsd:string` | Front End App must specify technology stack. |
| **`robos:frontendFramework`** | Frontend Framework | `1..*` | `xsd:string` | Front End App must declare frontend framework (React, Vue, Next.js, Angular, Svelte). |

---

## Canonical OSLC JSON-LD Example

```json
{
  "@id": "urn:robos:app:billing-portal",
  "@type": [
    "oslc_am:Resource",
    "robos:FrontEndApp"
  ],
  "dcterms:title": "Billing Web Portal",
  "robos:framework": "React 19 / Vite",
  "robos:package": "applications",
  "robos:namespace": "robos.applications"
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
        "@id": "urn:robos:app:billing-portal",
        "@type": [
            "oslc_am:Resource",
            "robos:FrontEndApp"
        ],
        "dcterms:title": "Billing Web Portal",
        "robos:framework": "React 19 / Vite",
        "robos:package": "applications",
        "robos:namespace": "robos.applications"
    }
  ],
}));

console.log("Conforms:", result.conforms); // Expected: true
```