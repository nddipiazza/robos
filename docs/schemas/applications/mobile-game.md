---
title: Mobile Game
layout: default
parent: Applications (robos.apps)
grand_parent: KGraph Schemas
nav_order: 8
permalink: /schemas/applications/mobile-game.html
---

# Schema: `robos:MobileGame`
{: .no_toc }

Formal W3C SHACL constraint shape and OSLC JSON-LD specification for `robos:MobileGame` in the `applications` package store.
{: .fs-6 .fw-300 }

## Table of contents
{: .no_toc .text-delta }

1. TOC
{:toc}

---

## Specification Metadata

- **RDF / OWL Class**: `robos:MobileGame`
- **Aliases / Target Classes**: `robos:MobileGame`
- **SHACL Shape ID**: `urn:robos:shape:MobileGameShape`
- **Governing Package**: [Applications (robos.apps)]({{ '/schemas/applications.html' | relative_url }}) (`applications`)
- **Namespace**: `robos.apps`

---

## Entity Relationship Diagram

```mermaid
graph LR
    ThisNode["MobileGame<br/><code>robos:MobileGame</code>"]:::primary
    classDef primary fill:#16243b,stroke:#00e5ff,stroke-width:2.5px,color:#ffffff;
    ThisNode -->|robos:repository| repository["repository"]
```

---

## Property Constraints & SHACL Rules

| Property Path | Name | Multiplicity | Data Type | Constraint Rule / Validation Message |
|---|---|---|---|---|
| **`dcterms:title`** | Title / Display Name | `1..*` | `xsd:string` | Mobile Game must have a title. |
| **`robos:repository`** | Git Repository | `1..*` | `xsd:string` | Mobile Game must define a repository. |
| **`robos:technology`** | Technology Stack | `1..*` | `xsd:string` | Mobile Game must specify technology stack. |
| **`robos:gameEngine`** | Game Engine | `1..*` | `xsd:string` | Mobile Game must specify game engine (Unity, Unreal Engine, Godot). |
| **`robos:platform`** | Target Platform | `1..*` | `xsd:string` | Mobile Game must specify mobile platform(s) (iOS, Android). |

---

## Canonical OSLC JSON-LD Example

```json
{
  "@id": "urn:robos:applications:mobile-game-sample",
  "@type": [
    "robos:MobileGame",
    "oslc:Resource"
  ],
  "dcterms:title": "Sample Mobile Game",
  "dcterms:description": "Canonical reference instance for robos:MobileGame.",
  "robos:package": "applications",
  "robos:namespace": "robos.apps",
  "robos:repository": "github.com/acme/sample-repo",
  "robos:technology": "Node.js / TypeScript",
  "robos:gameEngine": "Unreal Engine 5",
  "robos:platform": "iOS / Android"
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
        "@id": "urn:robos:applications:mobile-game-sample",
        "@type": [
            "robos:MobileGame",
            "oslc:Resource"
        ],
        "dcterms:title": "Sample Mobile Game",
        "dcterms:description": "Canonical reference instance for robos:MobileGame.",
        "robos:package": "applications",
        "robos:namespace": "robos.apps",
        "robos:repository": "github.com/acme/sample-repo",
        "robos:technology": "Node.js / TypeScript",
        "robos:gameEngine": "Unreal Engine 5",
        "robos:platform": "iOS / Android"
    }
  ],
}));

console.log("Conforms:", result.conforms); // Expected: true
```