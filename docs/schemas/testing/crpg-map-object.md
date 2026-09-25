---
title: CRPG Map Object
layout: default
parent: Testing, Quality & BDD (robos.testing)
grand_parent: KGraph Schemas
nav_order: 5
permalink: /schemas/testing/crpg-map-object.html
---

# Schema: `robos:CRPGMapObject`
{: .no_toc }

Formal W3C SHACL constraint shape and OSLC JSON-LD specification for `robos:CRPGMapObject` in the `testing` package store.
{: .fs-6 .fw-300 }

## Table of contents
{: .no_toc .text-delta }

1. TOC
{:toc}

---

## Specification Metadata

- **RDF / OWL Class**: `robos:CRPGMapObject`
- **Aliases / Target Classes**: `robos:CRPGMapObject`
- **SHACL Shape ID**: `urn:robos:shape:CRPGMapObjectShape`
- **Governing Package**: [Testing, Quality & BDD (robos.testing)]({{ '/schemas/testing.html' | relative_url }}) (`testing`)
- **Namespace**: `robos.testing`
- **Schema.org Classification**: [https://schema.org/Place](https://schema.org/Place)
- **Domain De Facto Standard**: [https://robos.dev/ns/crpg#MapObject](https://robos.dev/ns/crpg#MapObject)
- **Upstream Schema Basis (Refers From)**: [https://schema.org/Place](https://schema.org/Place)

---

## Upstream Schema Basis (Refers From) & Global Standards Provenance

This RobOS schema is modeled after and directly aligns with two levels of global standards:
- **Universal Schema.org Class**: [https://schema.org/Place](https://schema.org/Place) (100% interoperability with search engines, web indexers, and general AI reasoning)
- **Specialized Domain Standard**: [https://robos.dev/ns/crpg#MapObject](https://robos.dev/ns/crpg#MapObject) (de facto standard for domain-specific ALM, BDD, or infrastructure operations)
- **Canonical Reference**: [https://schema.org/Place](https://schema.org/Place)
- **Agent Guidelines**: When autonomous agents generate, expand, or validate instances of `robos:CRPGMapObject`, they MUST adhere to and base their output on this referred schema object and universal Schema.org parent class, extending it with RobOS SDLC properties.

---

## Entity Relationship & Schema Context

<div style="margin: 1.5rem 0; padding: 1.25rem; background: #161b22; border: 1px solid #30363d; border-radius: 8px;">
  <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.75rem; flex-wrap: wrap; gap: 0.5rem;">
    <span style="font-size: 1.15rem; font-weight: 700; color: #38bdf8;">CRPG Map Object</span>
    <span style="font-family: monospace; background: #121927; color: #00e5ff; border: 1px solid rgba(0, 229, 255, 0.4); padding: 0.2rem 0.6rem; border-radius: 6px; font-size: 0.85rem;">robos:CRPGMapObject</span>
  </div>
  <p style="margin-bottom: 0.75rem; font-size: 0.92rem; color: #c9d1d9;">Governed by W3C SHACL shape <code>urn:robos:shape:CRPGMapObjectShape</code> within the <strong>Testing, Quality & BDD (robos.testing)</strong> (<code>robos.testing</code>) package store.</p>
  <div style="display: flex; flex-wrap: wrap; gap: 0.5rem; margin-top: 0.5rem;">
    <span style="background: #0d1117; border: 1px solid #21262d; padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.8rem; color: #8b949e;"><code>robos:objectId</code></span>
    <span style="background: #0d1117; border: 1px solid #21262d; padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.8rem; color: #8b949e;"><code>robos:objectType</code></span>
    <span style="background: #0d1117; border: 1px solid #21262d; padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.8rem; color: #8b949e;"><code>robos:shape</code></span>
    <span style="background: #0d1117; border: 1px solid #21262d; padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.8rem; color: #8b949e;"><code>robos:position</code></span>
    <span style="background: #0d1117; border: 1px solid #21262d; padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.8rem; color: #8b949e;"><code>robos:size</code></span>
    <span style="background: #0d1117; border: 1px solid #21262d; padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.8rem; color: #8b949e;"><code>robos:radius</code></span>
    <span style="background: #0d1117; border: 1px solid #21262d; padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.8rem; color: #8b949e;"><code>robos:to</code></span>
    <span style="background: #0d1117; border: 1px solid #21262d; padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.8rem; color: #8b949e;"><code>robos:thickness</code></span>
    <span style="background: #0d1117; border: 1px solid #21262d; padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.8rem; color: #8b949e;"><code>robos:points</code></span>
    <span style="background: #0d1117; border: 1px solid #21262d; padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.8rem; color: #8b949e;"><code>robos:open</code></span>
    <span style="background: #0d1117; border: 1px solid #21262d; padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.8rem; color: #8b949e;"><code>robos:blocksMovement</code></span>
    <span style="background: #0d1117; border: 1px solid #21262d; padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.8rem; color: #8b949e;"><code>robos:blocksSight</code></span>
    <span style="background: #0d1117; border: 1px solid #21262d; padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.8rem; color: #8b949e;"><code>robos:difficultTerrain</code></span>
    <span style="background: #0d1117; border: 1px solid #21262d; padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.8rem; color: #8b949e;"><code>robos:cover</code></span>
  </div>
</div>

---

**RobOS classification:** Testing & behavior. These RobOS-owned codes use Schema.org CategoryCode vocabulary.

## Property Constraints & SHACL Rules

| Property Path | Name | Multiplicity | Data Type | Classification | Constraint Rule / Validation Message |
|---|---|---|---|---|---|
| **`robos:objectId`** | objectId | `1..*` | `xsd:string` | Testing & behavior | Map object must have an object id. |
| **`robos:objectType`** | objectType | `1..*` | `xsd:string` | Testing & behavior | Map object must declare its type: wall, building, door, pillar, tree, rock, statue, crate, barrel, table, altar, bed, chest, fence, pit, water, bush, rubble, stairs, road, bridge, rug or zone. |
| **`robos:shape`** | shape | `1..*` | `xsd:string` | Testing & behavior | Map object must declare its shape: rect, circle, line or polygon. |
| **`robos:position`** | position | `1..*` | `xsd:string` | Testing & behavior | Map object must have a position in feet (rect top-left, circle centre, line start). |
| **`robos:size`** | size | `0..*` | `xsd:string` | Testing & behavior | Rect width and height in feet. |
| **`robos:radius`** | radius | `0..*` | `xsd:string` | Testing & behavior | Circle radius in feet. |
| **`robos:to`** | to | `0..*` | `xsd:string` | Testing & behavior | Line end point in feet. |
| **`robos:thickness`** | thickness | `0..*` | `xsd:string` | Testing & behavior | Line thickness in feet (default 5). |
| **`robos:points`** | points | `0..*` | `xsd:string` | Testing & behavior | Polygon vertices in feet. |
| **`robos:open`** | open | `0..*` | `xsd:string` | Testing & behavior | Doors: true for an open door that creatures and sight pass through. |
| **`robos:blocksMovement`** | blocksMovement | `0..*` | `xsd:string` | Testing & behavior | Override the type default for blocking movement. |
| **`robos:blocksSight`** | blocksSight | `0..*` | `xsd:string` | Testing & behavior | Override the type default for blocking line of sight. |
| **`robos:difficultTerrain`** | difficultTerrain | `0..*` | `xsd:string` | Testing & behavior | Override the type default for difficult terrain (double movement cost). |
| **`robos:cover`** | cover | `0..*` | `xsd:string` | Testing & behavior | Override the cover it gives: none, half or three-quarters. |

---

## Canonical OSLC JSON-LD Example

```json
{
  "@id": "urn:robos:testing:crpg-map-object-sample",
  "@type": [
    "robos:CRPGMapObject",
    "schema:Place",
    "oslc:Resource"
  ],
  "dcterms:title": "Sample CRPG Map Object",
  "dcterms:description": "Canonical reference instance for robos:CRPGMapObject.",
  "robos:package": "testing",
  "robos:namespace": "robos.testing",
  "robos:schemaOrgType": "https://schema.org/Place",
  "robos:domainStandard": "https://robos.dev/ns/crpg#MapObject",
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
        "@id": "urn:robos:testing:crpg-map-object-sample",
        "@type": [
            "robos:CRPGMapObject",
            "schema:Place",
            "oslc:Resource"
        ],
        "dcterms:title": "Sample CRPG Map Object",
        "dcterms:description": "Canonical reference instance for robos:CRPGMapObject.",
        "robos:package": "testing",
        "robos:namespace": "robos.testing",
        "robos:schemaOrgType": "https://schema.org/Place",
        "robos:domainStandard": "https://robos.dev/ns/crpg#MapObject",
        "robos:refersFrom": "https://schema.org/Place"
    }
  ],
}));

console.log("Conforms:", result.conforms); // Expected: true
```