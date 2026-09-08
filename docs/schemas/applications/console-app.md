---
title: Console App
layout: default
parent: Applications (robos.apps)
grand_parent: KGraph Schemas
nav_order: 2
permalink: /schemas/applications/console-app.html
---

# Schema: `robos:ConsoleApp`
{: .no_toc }

Formal W3C SHACL constraint shape and OSLC JSON-LD specification for `robos:ConsoleApp` in the `applications` package store.
{: .fs-6 .fw-300 }

## Table of contents
{: .no_toc .text-delta }

1. TOC
{:toc}

---

## Specification Metadata

- **RDF / OWL Class**: `robos:ConsoleApp`
- **Aliases / Target Classes**: `robos:ConsoleApp`
- **SHACL Shape ID**: `urn:robos:shape:ConsoleAppShape`
- **Governing Package**: [Applications (robos.apps)]({{ '/schemas/applications.html' | relative_url }}) (`applications`)
- **Namespace**: `robos.apps`

---

## Entity Relationship Diagram

```mermaid
graph LR
    ThisNode["ConsoleApp<br/><code>robos:ConsoleApp</code>"]:::primary
    classDef primary fill:#00bcd4,stroke:#00838f,stroke-width:2px,color:#000;
    ThisNode -->|robos:repository| repository["repository"]
```

---

## Property Constraints & SHACL Rules

| Property Path | Name | Multiplicity | Data Type | Constraint Rule / Validation Message |
|---|---|---|---|---|
| **`dcterms:title`** | Title / Display Name | `1..*` | `xsd:string` | Console App must have a title. |
| **`robos:repository`** | Git Repository | `1..*` | `xsd:string` | Console App must define a repository. |
| **`robos:technology`** | Technology Stack | `1..*` | `xsd:string` | Console App must specify technology stack. |
| **`robos:cliCommand`** | CLI Binary Command | `1..*` | `xsd:string` | Console App must declare executable CLI command name. |

---

## Canonical OSLC JSON-LD Example

```json
{
  "@id": "urn:robos:applications:console-app-sample",
  "@type": [
    "robos:ConsoleApp",
    "oslc:Resource"
  ],
  "dcterms:title": "Sample Console App",
  "dcterms:description": "Canonical reference instance for robos:ConsoleApp.",
  "robos:package": "applications",
  "robos:namespace": "robos.apps",
  "robos:repository": "github.com/acme/sample-repo",
  "robos:technology": "Node.js / TypeScript",
  "robos:cliCommand": "robos"
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
        "@id": "urn:robos:applications:console-app-sample",
        "@type": [
            "robos:ConsoleApp",
            "oslc:Resource"
        ],
        "dcterms:title": "Sample Console App",
        "dcterms:description": "Canonical reference instance for robos:ConsoleApp.",
        "robos:package": "applications",
        "robos:namespace": "robos.apps",
        "robos:repository": "github.com/acme/sample-repo",
        "robos:technology": "Node.js / TypeScript",
        "robos:cliCommand": "robos"
    }
  ],
}));

console.log("Conforms:", result.conforms); // Expected: true
```