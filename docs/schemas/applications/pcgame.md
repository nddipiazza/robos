---
title: PCGame
layout: default
parent: Applications (robos.apps)
grand_parent: KGraph Schemas
nav_order: 6
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

## Entity Relationship & Schema Context

<div style="margin: 1.5rem 0; padding: 1.25rem; background: #161b22; border: 1px solid #30363d; border-radius: 8px;">
  <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.75rem; flex-wrap: wrap; gap: 0.5rem;">
    <span style="font-size: 1.15rem; font-weight: 700; color: #38bdf8;">PCGame</span>
    <span style="font-family: monospace; background: #121927; color: #00e5ff; border: 1px solid rgba(0, 229, 255, 0.4); padding: 0.2rem 0.6rem; border-radius: 6px; font-size: 0.85rem;">robos:PCGame</span>
  </div>
  <p style="margin-bottom: 0.75rem; font-size: 0.92rem; color: #c9d1d9;">Governed by W3C SHACL shape <code>urn:robos:shape:PCGameShape</code> within the <strong>Applications (robos.apps)</strong> (<code>robos.apps</code>) package store.</p>
  <div style="display: flex; flex-wrap: wrap; gap: 0.5rem; margin-top: 0.5rem;">
    <span style="background: #0d1117; border: 1px solid #21262d; padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.8rem; color: #8b949e;"><code>dcterms:title</code></span>
    <span style="background: #0d1117; border: 1px solid #21262d; padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.8rem; color: #8b949e;"><code>robos:repository</code></span>
    <span style="background: #0d1117; border: 1px solid #21262d; padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.8rem; color: #8b949e;"><code>robos:technology</code></span>
    <span style="background: #0d1117; border: 1px solid #21262d; padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.8rem; color: #8b949e;"><code>robos:gameEngine</code></span>
    <span style="background: #0d1117; border: 1px solid #21262d; padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.8rem; color: #8b949e;"><code>robos:targetPlatform</code></span>
  </div>
</div>

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