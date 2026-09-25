---
title: CRPG Player Input
layout: default
parent: Testing, Quality & BDD (robos.testing)
grand_parent: KGraph Schemas
nav_order: 8
permalink: /schemas/testing/crpg-player-input.html
---

# Schema: `robos:CRPGPlayerInput`
{: .no_toc }

Formal W3C SHACL constraint shape and OSLC JSON-LD specification for `robos:CRPGPlayerInput` in the `testing` package store.
{: .fs-6 .fw-300 }

## Table of contents
{: .no_toc .text-delta }

1. TOC
{:toc}

---

## Specification Metadata

- **RDF / OWL Class**: `robos:CRPGPlayerInput`
- **Aliases / Target Classes**: `robos:CRPGPlayerInput`
- **SHACL Shape ID**: `urn:robos:shape:CRPGPlayerInputShape`
- **Governing Package**: [Testing, Quality & BDD (robos.testing)]({{ '/schemas/testing.html' | relative_url }}) (`testing`)
- **Namespace**: `robos.testing`
- **Schema.org Classification**: [https://schema.org/InteractAction](https://schema.org/InteractAction)
- **Domain De Facto Standard**: [https://robos.dev/ns/crpg#PlayerInput](https://robos.dev/ns/crpg#PlayerInput)
- **Upstream Schema Basis (Refers From)**: [https://schema.org/Action](https://schema.org/Action)

---

## Upstream Schema Basis (Refers From) & Global Standards Provenance

This RobOS schema is modeled after and directly aligns with two levels of global standards:
- **Universal Schema.org Class**: [https://schema.org/InteractAction](https://schema.org/InteractAction) (100% interoperability with search engines, web indexers, and general AI reasoning)
- **Specialized Domain Standard**: [https://robos.dev/ns/crpg#PlayerInput](https://robos.dev/ns/crpg#PlayerInput) (de facto standard for domain-specific ALM, BDD, or infrastructure operations)
- **Canonical Reference**: [https://schema.org/Action](https://schema.org/Action)
- **Agent Guidelines**: When autonomous agents generate, expand, or validate instances of `robos:CRPGPlayerInput`, they MUST adhere to and base their output on this referred schema object and universal Schema.org parent class, extending it with RobOS SDLC properties.

---

## Entity Relationship & Schema Context

<div style="margin: 1.5rem 0; padding: 1.25rem; background: #161b22; border: 1px solid #30363d; border-radius: 8px;">
  <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.75rem; flex-wrap: wrap; gap: 0.5rem;">
    <span style="font-size: 1.15rem; font-weight: 700; color: #38bdf8;">CRPG Player Input</span>
    <span style="font-family: monospace; background: #121927; color: #00e5ff; border: 1px solid rgba(0, 229, 255, 0.4); padding: 0.2rem 0.6rem; border-radius: 6px; font-size: 0.85rem;">robos:CRPGPlayerInput</span>
  </div>
  <p style="margin-bottom: 0.75rem; font-size: 0.92rem; color: #c9d1d9;">Governed by W3C SHACL shape <code>urn:robos:shape:CRPGPlayerInputShape</code> within the <strong>Testing, Quality & BDD (robos.testing)</strong> (<code>robos.testing</code>) package store.</p>
  <div style="display: flex; flex-wrap: wrap; gap: 0.5rem; margin-top: 0.5rem;">
    <span style="background: #0d1117; border: 1px solid #21262d; padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.8rem; color: #8b949e;"><code>robos:type</code></span>
    <span style="background: #0d1117; border: 1px solid #21262d; padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.8rem; color: #8b949e;"><code>robos:round</code></span>
    <span style="background: #0d1117; border: 1px solid #21262d; padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.8rem; color: #8b949e;"><code>robos:target</code></span>
    <span style="background: #0d1117; border: 1px solid #21262d; padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.8rem; color: #8b949e;"><code>robos:spell</code></span>
    <span style="background: #0d1117; border: 1px solid #21262d; padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.8rem; color: #8b949e;"><code>robos:item</code></span>
    <span style="background: #0d1117; border: 1px solid #21262d; padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.8rem; color: #8b949e;"><code>robos:point</code></span>
    <span style="background: #0d1117; border: 1px solid #21262d; padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.8rem; color: #8b949e;"><code>robos:to</code></span>
  </div>
</div>

---

**RobOS classification:** Testing & behavior. These RobOS-owned codes use Schema.org CategoryCode vocabulary.

## Property Constraints & SHACL Rules

| Property Path | Name | Multiplicity | Data Type | Classification | Constraint Rule / Validation Message |
|---|---|---|---|---|---|
| **`robos:type`** | type | `1..*` | `xsd:string` | Testing & behavior | Player input must declare its type: attack, cast, use_item, move, dodge, disengage, search, disarm or wait. |
| **`robos:round`** | round | `0..*` | `xsd:string` | Testing & behavior | Round in which to play this input; omitted means the actor's next turn. |
| **`robos:target`** | target | `0..*` | `xsd:string` | Schema & graph metadata | Actor id the input targets. |
| **`robos:spell`** | spell | `0..*` | `xsd:string` | Testing & behavior | Spell id for cast inputs. |
| **`robos:item`** | item | `0..*` | `xsd:string` | Testing & behavior | Item id for use_item inputs. |
| **`robos:point`** | point | `0..*` | `xsd:string` | Testing & behavior | [x, y] in feet for area spells. |
| **`robos:to`** | to | `0..*` | `xsd:string` | Testing & behavior | [x, y] in feet for move inputs. |

---

## Canonical OSLC JSON-LD Example

```json
{
  "@id": "urn:robos:testing:crpg-player-input-sample",
  "@type": [
    "robos:CRPGPlayerInput",
    "schema:InteractAction",
    "oslc:Resource"
  ],
  "dcterms:title": "Sample CRPG Player Input",
  "dcterms:description": "Canonical reference instance for robos:CRPGPlayerInput.",
  "robos:package": "testing",
  "robos:namespace": "robos.testing",
  "robos:schemaOrgType": "https://schema.org/InteractAction",
  "robos:domainStandard": "https://robos.dev/ns/crpg#PlayerInput",
  "robos:refersFrom": "https://schema.org/Action"
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
        "@id": "urn:robos:testing:crpg-player-input-sample",
        "@type": [
            "robos:CRPGPlayerInput",
            "schema:InteractAction",
            "oslc:Resource"
        ],
        "dcterms:title": "Sample CRPG Player Input",
        "dcterms:description": "Canonical reference instance for robos:CRPGPlayerInput.",
        "robos:package": "testing",
        "robos:namespace": "robos.testing",
        "robos:schemaOrgType": "https://schema.org/InteractAction",
        "robos:domainStandard": "https://robos.dev/ns/crpg#PlayerInput",
        "robos:refersFrom": "https://schema.org/Action"
    }
  ],
}));

console.log("Conforms:", result.conforms); // Expected: true
```