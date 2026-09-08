---
title: PCGame
layout: default
parent: Applications (robos.apps)
grand_parent: KGraph Schemas
nav_order: 7
permalink: /schemas/applications/pcgame.html
---

# Schema: `robos:PCGame`
{: .no_toc }

Formal W3C SHACL constraint shape and OSLC JSON-LD specification for `robos:PCGame` in the `applications` package store.
{: .fs-6 .fw-300 }

## Table of contents
{: .no_toc .text-delta }

1. TOC
{:toc}

---

## Specification Metadata

- **RDF / OWL Class**: `robos:PCGame`
- **Aliases / Target Classes**: `robos:PCGame`
- **SHACL Shape ID**: `urn:robos:shape:PCGameShape`
- **Governing Package**: [Applications (robos.apps)]({{ '/schemas/applications.html' | relative_url }}) (`applications`)
- **Namespace**: `robos.apps`

---

## Entity Relationship Diagram

```mermaid
graph LR
    ThisNode["PCGame<br/><code>robos:PCGame</code>"]:::primary
    classDef primary fill:#16243b,stroke:#00e5ff,stroke-width:2.5px,color:#ffffff;
    ThisNode -->|robos:repository| repository["repository"]
```

---

## Property Constraints & SHACL Rules

| Property Path | Name | Multiplicity | Data Type | Constraint Rule / Validation Message |
|---|---|---|---|---|
| **`dcterms:title`** | Title / Display Name | `1..*` | `xsd:string` | PC Game must have a title. |
| **`robos:repository`** | Git Repository | `1..*` | `xsd:string` | PC Game must define a repository. |
| **`robos:technology`** | Technology Stack | `1..*` | `xsd:string` | PC Game must specify technology stack. |
| **`robos:gameEngine`** | Game Engine | `1..*` | `xsd:string` | PC Game must specify game engine (Unreal Engine, Unity, Godot, Bevy). |
| **`robos:targetPlatform`** | Gaming Target Platform | `1..*` | `xsd:string` | PC Game must specify target PC platform(s) (Windows, Linux, macOS). |

---

## Canonical OSLC JSON-LD Example

```json
{
  "@id": "urn:robos:applications:pcgame-sample",
  "@type": [
    "robos:PCGame",
    "oslc:Resource"
  ],
  "dcterms:title": "Sample PCGame",
  "dcterms:description": "Canonical reference instance for robos:PCGame.",
  "robos:package": "applications",
  "robos:namespace": "robos.apps",
  "robos:repository": "github.com/acme/sample-repo",
  "robos:technology": "Node.js / TypeScript",
  "robos:gameEngine": "Unreal Engine 5",
  "robos:targetPlatform": "Windows / Linux"
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
        "@id": "urn:robos:applications:pcgame-sample",
        "@type": [
            "robos:PCGame",
            "oslc:Resource"
        ],
        "dcterms:title": "Sample PCGame",
        "dcterms:description": "Canonical reference instance for robos:PCGame.",
        "robos:package": "applications",
        "robos:namespace": "robos.apps",
        "robos:repository": "github.com/acme/sample-repo",
        "robos:technology": "Node.js / TypeScript",
        "robos:gameEngine": "Unreal Engine 5",
        "robos:targetPlatform": "Windows / Linux"
    }
  ],
}));

console.log("Conforms:", result.conforms); // Expected: true
```