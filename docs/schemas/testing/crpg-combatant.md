---
title: CRPG Combatant
layout: default
parent: Testing, Quality & BDD (robos.testing)
grand_parent: KGraph Schemas
nav_order: 6
permalink: /schemas/testing/crpg-combatant.html
---

# Schema: `robos:CRPGCombatant`
{: .no_toc }

Formal W3C SHACL constraint shape and OSLC JSON-LD specification for `robos:CRPGCombatant` in the `testing` package store.
{: .fs-6 .fw-300 }

## Table of contents
{: .no_toc .text-delta }

1. TOC
{:toc}

---

## Specification Metadata

- **RDF / OWL Class**: `robos:CRPGCombatant`
- **Aliases / Target Classes**: `robos:CRPGCombatant`
- **SHACL Shape ID**: `urn:robos:shape:CRPGCombatantShape`
- **Governing Package**: [Testing, Quality & BDD (robos.testing)]({{ '/schemas/testing.html' | relative_url }}) (`testing`)
- **Namespace**: `robos.testing`
- **Schema.org Classification**: [https://schema.org/Person](https://schema.org/Person)
- **Domain De Facto Standard**: [https://robos.dev/ns/crpg#Combatant](https://robos.dev/ns/crpg#Combatant)
- **Upstream Schema Basis (Refers From)**: [https://schema.org/Person](https://schema.org/Person)

---

## Upstream Schema Basis (Refers From) & Global Standards Provenance

This RobOS schema is modeled after and directly aligns with two levels of global standards:
- **Universal Schema.org Class**: [https://schema.org/Person](https://schema.org/Person) (100% interoperability with search engines, web indexers, and general AI reasoning)
- **Specialized Domain Standard**: [https://robos.dev/ns/crpg#Combatant](https://robos.dev/ns/crpg#Combatant) (de facto standard for domain-specific ALM, BDD, or infrastructure operations)
- **Canonical Reference**: [https://schema.org/Person](https://schema.org/Person)
- **Agent Guidelines**: When autonomous agents generate, expand, or validate instances of `robos:CRPGCombatant`, they MUST adhere to and base their output on this referred schema object and universal Schema.org parent class, extending it with RobOS SDLC properties.

---

## Entity Relationship & Schema Context

<div style="margin: 1.5rem 0; padding: 1.25rem; background: #161b22; border: 1px solid #30363d; border-radius: 8px;">
  <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.75rem; flex-wrap: wrap; gap: 0.5rem;">
    <span style="font-size: 1.15rem; font-weight: 700; color: #38bdf8;">CRPG Combatant</span>
    <span style="font-family: monospace; background: #121927; color: #00e5ff; border: 1px solid rgba(0, 229, 255, 0.4); padding: 0.2rem 0.6rem; border-radius: 6px; font-size: 0.85rem;">robos:CRPGCombatant</span>
  </div>
  <p style="margin-bottom: 0.75rem; font-size: 0.92rem; color: #c9d1d9;">Governed by W3C SHACL shape <code>urn:robos:shape:CRPGCombatantShape</code> within the <strong>Testing, Quality & BDD (robos.testing)</strong> (<code>robos.testing</code>) package store.</p>
  <div style="display: flex; flex-wrap: wrap; gap: 0.5rem; margin-top: 0.5rem;">
    <span style="background: #0d1117; border: 1px solid #21262d; padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.8rem; color: #8b949e;"><code>robos:actorId</code></span>
    <span style="background: #0d1117; border: 1px solid #21262d; padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.8rem; color: #8b949e;"><code>robos:characterClass</code></span>
    <span style="background: #0d1117; border: 1px solid #21262d; padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.8rem; color: #8b949e;"><code>robos:monster</code></span>
    <span style="background: #0d1117; border: 1px solid #21262d; padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.8rem; color: #8b949e;"><code>robos:position</code></span>
  </div>
</div>

---

**RobOS classification:** Testing & behavior. These RobOS-owned codes use Schema.org CategoryCode vocabulary.

## Property Constraints & SHACL Rules

| Property Path | Name | Multiplicity | Data Type | Classification | Constraint Rule / Validation Message |
|---|---|---|---|---|---|
| **`robos:actorId`** | actorId | `1..*` | `xsd:string` | Testing & behavior | Combatant must have an actor id that directives, inputs and assertions refer to. |
| **`robos:characterClass`** | characterClass | `0..*` | `xsd:string` | Testing & behavior | Party combatants name a robos:CRPGClass (fighter, wizard, ...). |
| **`robos:monster`** | monster | `0..*` | `xsd:string` | Testing & behavior | Enemy combatants name a robos:CRPGMonster, or give a custom stat block with robos:attacks. |
| **`robos:position`** | position | `0..*` | `xsd:string` | Testing & behavior | Starting position in feet as [x, y]. |

---

## Canonical OSLC JSON-LD Example

```json
{
  "@id": "urn:robos:testing:crpg-combatant-sample",
  "@type": [
    "robos:CRPGCombatant",
    "schema:Person",
    "oslc:Resource"
  ],
  "dcterms:title": "Sample CRPG Combatant",
  "dcterms:description": "Canonical reference instance for robos:CRPGCombatant.",
  "robos:package": "testing",
  "robos:namespace": "robos.testing",
  "robos:schemaOrgType": "https://schema.org/Person",
  "robos:domainStandard": "https://robos.dev/ns/crpg#Combatant",
  "robos:refersFrom": "https://schema.org/Person"
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
        "@id": "urn:robos:testing:crpg-combatant-sample",
        "@type": [
            "robos:CRPGCombatant",
            "schema:Person",
            "oslc:Resource"
        ],
        "dcterms:title": "Sample CRPG Combatant",
        "dcterms:description": "Canonical reference instance for robos:CRPGCombatant.",
        "robos:package": "testing",
        "robos:namespace": "robos.testing",
        "robos:schemaOrgType": "https://schema.org/Person",
        "robos:domainStandard": "https://robos.dev/ns/crpg#Combatant",
        "robos:refersFrom": "https://schema.org/Person"
    }
  ],
}));

console.log("Conforms:", result.conforms); // Expected: true
```