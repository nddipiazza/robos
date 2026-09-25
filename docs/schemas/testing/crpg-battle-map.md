---
title: CRPG Battle Map
layout: default
parent: Testing, Quality & BDD (robos.testing)
grand_parent: KGraph Schemas
nav_order: 4
permalink: /schemas/testing/crpg-battle-map.html
---

# Schema: `robos:CRPGBattleMap`
{: .no_toc }

Formal W3C SHACL constraint shape and OSLC JSON-LD specification for `robos:CRPGBattleMap` in the `testing` package store.
{: .fs-6 .fw-300 }

## Table of contents
{: .no_toc .text-delta }

1. TOC
{:toc}

---

## Specification Metadata

- **RDF / OWL Class**: `robos:CRPGBattleMap`
- **Aliases / Target Classes**: `robos:CRPGBattleMap`
- **SHACL Shape ID**: `urn:robos:shape:CRPGBattleMapShape`
- **Governing Package**: [Testing, Quality & BDD (robos.testing)]({{ '/schemas/testing.html' | relative_url }}) (`testing`)
- **Namespace**: `robos.testing`
- **Schema.org Classification**: [https://schema.org/Place](https://schema.org/Place)
- **Domain De Facto Standard**: [https://schema.org/Place](https://schema.org/Place)
- **Upstream Schema Basis (Refers From)**: [https://schema.org/Place](https://schema.org/Place)

---

## Upstream Schema Basis (Refers From) & Global Standards Provenance

This RobOS schema is modeled after and directly aligns with two levels of global standards:
- **Universal Schema.org Class**: [https://schema.org/Place](https://schema.org/Place) (100% interoperability with search engines, web indexers, and general AI reasoning)
- **Specialized Domain Standard**: [https://schema.org/Place](https://schema.org/Place) (de facto standard for domain-specific ALM, BDD, or infrastructure operations)
- **Canonical Reference**: [https://schema.org/Place](https://schema.org/Place)
- **Agent Guidelines**: When autonomous agents generate, expand, or validate instances of `robos:CRPGBattleMap`, they MUST adhere to and base their output on this referred schema object and universal Schema.org parent class, extending it with RobOS SDLC properties.

---

## Entity Relationship & Schema Context

<div style="margin: 1.5rem 0; padding: 1.25rem; background: #161b22; border: 1px solid #30363d; border-radius: 8px;">
  <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.75rem; flex-wrap: wrap; gap: 0.5rem;">
    <span style="font-size: 1.15rem; font-weight: 700; color: #38bdf8;">CRPG Battle Map</span>
    <span style="font-family: monospace; background: #121927; color: #00e5ff; border: 1px solid rgba(0, 229, 255, 0.4); padding: 0.2rem 0.6rem; border-radius: 6px; font-size: 0.85rem;">robos:CRPGBattleMap</span>
  </div>
  <p style="margin-bottom: 0.75rem; font-size: 0.92rem; color: #c9d1d9;">Governed by W3C SHACL shape <code>urn:robos:shape:CRPGBattleMapShape</code> within the <strong>Testing, Quality & BDD (robos.testing)</strong> (<code>robos.testing</code>) package store.</p>
  <div style="display: flex; flex-wrap: wrap; gap: 0.5rem; margin-top: 0.5rem;">
    <span style="background: #0d1117; border: 1px solid #21262d; padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.8rem; color: #8b949e;"><code>dcterms:title</code></span>
    <span style="background: #0d1117; border: 1px solid #21262d; padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.8rem; color: #8b949e;"><code>robos:width</code></span>
    <span style="background: #0d1117; border: 1px solid #21262d; padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.8rem; color: #8b949e;"><code>robos:height</code></span>
    <span style="background: #0d1117; border: 1px solid #21262d; padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.8rem; color: #8b949e;"><code>robos:mapZone</code></span>
    <span style="background: #0d1117; border: 1px solid #21262d; padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.8rem; color: #8b949e;"><code>robos:terrain</code></span>
    <span style="background: #0d1117; border: 1px solid #21262d; padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.8rem; color: #8b949e;"><code>robos:mapObjects</code></span>
    <span style="background: #0d1117; border: 1px solid #21262d; padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.8rem; color: #8b949e;"><code>robos:blockout</code></span>
    <span style="background: #0d1117; border: 1px solid #21262d; padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.8rem; color: #8b949e;"><code>robos:backgroundImage</code></span>
  </div>
</div>

---

**RobOS classification:** Testing & behavior. These RobOS-owned codes use Schema.org CategoryCode vocabulary.

## Property Constraints & SHACL Rules

| Property Path | Name | Multiplicity | Data Type | Classification | Constraint Rule / Validation Message |
|---|---|---|---|---|---|
| **`dcterms:title`** | Title / Display Name | `1..*` | `xsd:string` | Services & processing, Applications & entry points, Contracts & data models, Data stores & messaging, Libraries & build systems, Infrastructure & delivery, Organization & people, Projects & work items, Source control & artifacts, Agents & MCP, Documentation & decisions, Learning & assessment, Testing & behavior | Battle map must have a title. |
| **`robos:width`** | width | `1..*` | `xsd:string` | Testing & behavior | Battle map must declare its width in feet. |
| **`robos:height`** | height | `1..*` | `xsd:string` | Testing & behavior | Battle map must declare its height in feet. |
| **`robos:mapZone`** | mapZone | `0..*` | `xsd:string` | Testing & behavior | Optional link to the robos:CRPGMapZone this battle takes place in. |
| **`robos:terrain`** | terrain | `0..*` | `xsd:string` | Testing & behavior | Floor terrain for the blockout image: stone, grass, dirt, sand, wood, snow or cave. |
| **`robos:mapObjects`** | mapObjects | `0..*` | `xsd:string` | Testing & behavior | Static scene objects (robos:CRPGMapObject): walls, buildings, doors, trees, props. |
| **`robos:blockout`** | blockout | `0..*` | `xsd:string` | Testing & behavior | 5-ft collision grid (blocked, opaque, difficult, cover) written by robos-crpg-blockout build. |
| **`robos:backgroundImage`** | backgroundImage | `0..*` | `xsd:string` | Testing & behavior | Blockout background image rendered by robos-crpg-blockout (res:// path). |

---

## Canonical OSLC JSON-LD Example

```json
{
  "@id": "urn:robos:testing:crpg-battle-map-sample",
  "@type": [
    "robos:CRPGBattleMap",
    "schema:Place",
    "oslc:Resource"
  ],
  "dcterms:title": "Sample CRPG Battle Map",
  "dcterms:description": "Canonical reference instance for robos:CRPGBattleMap.",
  "robos:package": "testing",
  "robos:namespace": "robos.testing",
  "robos:schemaOrgType": "https://schema.org/Place",
  "robos:domainStandard": "https://schema.org/Place",
  "robos:refersFrom": "https://schema.org/Place"
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
        "@id": "urn:robos:testing:crpg-battle-map-sample",
        "@type": [
            "robos:CRPGBattleMap",
            "schema:Place",
            "oslc:Resource"
        ],
        "dcterms:title": "Sample CRPG Battle Map",
        "dcterms:description": "Canonical reference instance for robos:CRPGBattleMap.",
        "robos:package": "testing",
        "robos:namespace": "robos.testing",
        "robos:schemaOrgType": "https://schema.org/Place",
        "robos:domainStandard": "https://schema.org/Place",
        "robos:refersFrom": "https://schema.org/Place"
    }
  ],
}));

console.log("Conforms:", result.conforms); // Expected: true
```