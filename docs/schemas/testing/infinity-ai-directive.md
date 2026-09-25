---
title: Infinity AI Directive
layout: default
parent: Testing, Quality & BDD (robos.testing)
grand_parent: KGraph Schemas
nav_order: 7
permalink: /schemas/testing/infinity-ai-directive.html
---

# Schema: `robos:InfinityAIDirective`
{: .no_toc }

Formal W3C SHACL constraint shape and OSLC JSON-LD specification for `robos:InfinityAIDirective` in the `testing` package store.
{: .fs-6 .fw-300 }

## Table of contents
{: .no_toc .text-delta }

1. TOC
{:toc}

---

## Specification Metadata

- **RDF / OWL Class**: `robos:InfinityAIDirective`
- **Aliases / Target Classes**: `robos:InfinityAIDirective`
- **SHACL Shape ID**: `urn:robos:shape:InfinityAIDirectiveShape`
- **Governing Package**: [Testing, Quality & BDD (robos.testing)]({{ '/schemas/testing.html' | relative_url }}) (`testing`)
- **Namespace**: `robos.testing`
- **Schema.org Classification**: [https://schema.org/ControlAction](https://schema.org/ControlAction)
- **Domain De Facto Standard**: [https://robos.dev/ns/crpg#InfinityAIDirective](https://robos.dev/ns/crpg#InfinityAIDirective)
- **Upstream Schema Basis (Refers From)**: [https://schema.org/Action](https://schema.org/Action)

---

## Upstream Schema Basis (Refers From) & Global Standards Provenance

This RobOS schema is modeled after and directly aligns with two levels of global standards:
- **Universal Schema.org Class**: [https://schema.org/ControlAction](https://schema.org/ControlAction) (100% interoperability with search engines, web indexers, and general AI reasoning)
- **Specialized Domain Standard**: [https://robos.dev/ns/crpg#InfinityAIDirective](https://robos.dev/ns/crpg#InfinityAIDirective) (de facto standard for domain-specific ALM, BDD, or infrastructure operations)
- **Canonical Reference**: [https://schema.org/Action](https://schema.org/Action)
- **Agent Guidelines**: When autonomous agents generate, expand, or validate instances of `robos:InfinityAIDirective`, they MUST adhere to and base their output on this referred schema object and universal Schema.org parent class, extending it with RobOS SDLC properties.

---

## Entity Relationship & Schema Context

<div style="margin: 1.5rem 0; padding: 1.25rem; background: #161b22; border: 1px solid #30363d; border-radius: 8px;">
  <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.75rem; flex-wrap: wrap; gap: 0.5rem;">
    <span style="font-size: 1.15rem; font-weight: 700; color: #38bdf8;">Infinity AI Directive</span>
    <span style="font-family: monospace; background: #121927; color: #00e5ff; border: 1px solid rgba(0, 229, 255, 0.4); padding: 0.2rem 0.6rem; border-radius: 6px; font-size: 0.85rem;">robos:InfinityAIDirective</span>
  </div>
  <p style="margin-bottom: 0.75rem; font-size: 0.92rem; color: #c9d1d9;">Governed by W3C SHACL shape <code>urn:robos:shape:InfinityAIDirectiveShape</code> within the <strong>Testing, Quality & BDD (robos.testing)</strong> (<code>robos.testing</code>) package store.</p>
  <div style="display: flex; flex-wrap: wrap; gap: 0.5rem; margin-top: 0.5rem;">
    <span style="background: #0d1117; border: 1px solid #21262d; padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.8rem; color: #8b949e;"><code>robos:controller</code></span>
    <span style="background: #0d1117; border: 1px solid #21262d; padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.8rem; color: #8b949e;"><code>robos:actor</code></span>
    <span style="background: #0d1117; border: 1px solid #21262d; padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.8rem; color: #8b949e;"><code>robos:side</code></span>
    <span style="background: #0d1117; border: 1px solid #21262d; padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.8rem; color: #8b949e;"><code>robos:targetPriority</code></span>
    <span style="background: #0d1117; border: 1px solid #21262d; padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.8rem; color: #8b949e;"><code>robos:focusTarget</code></span>
    <span style="background: #0d1117; border: 1px solid #21262d; padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.8rem; color: #8b949e;"><code>robos:preferSpells</code></span>
    <span style="background: #0d1117; border: 1px solid #21262d; padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.8rem; color: #8b949e;"><code>robos:forbidSpells</code></span>
    <span style="background: #0d1117; border: 1px solid #21262d; padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.8rem; color: #8b949e;"><code>robos:healThreshold</code></span>
    <span style="background: #0d1117; border: 1px solid #21262d; padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.8rem; color: #8b949e;"><code>robos:movement</code></span>
    <span style="background: #0d1117; border: 1px solid #21262d; padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.8rem; color: #8b949e;"><code>robos:scriptedInputs</code></span>
  </div>
</div>

---

**RobOS classification:** Testing & behavior. These RobOS-owned codes use Schema.org CategoryCode vocabulary.

## Property Constraints & SHACL Rules

| Property Path | Name | Multiplicity | Data Type | Classification | Constraint Rule / Validation Message |
|---|---|---|---|---|---|
| **`robos:controller`** | controller | `1..*` | `xsd:string` | Testing & behavior | Directive must declare its controller: infinity_ai, scripted or idle. |
| **`robos:actor`** | actor | `0..*` | `xsd:string` | Testing & behavior | The combatant this directive steers; omit and set robos:side to steer a whole side. |
| **`robos:side`** | side | `0..*` | `xsd:string` | Testing & behavior | party, enemy or all: steer every combatant on that side. |
| **`robos:targetPriority`** | targetPriority | `0..*` | `xsd:string` | Testing & behavior | nearest, lowest_hp, highest_hp, weakest_ac or spellcaster. |
| **`robos:focusTarget`** | focusTarget | `0..*` | `xsd:string` | Testing & behavior | Actor id to attack whenever it is a valid target. |
| **`robos:preferSpells`** | preferSpells | `0..*` | `xsd:string` | Testing & behavior | Spell ids to try first, in order. |
| **`robos:forbidSpells`** | forbidSpells | `0..*` | `xsd:string` | Testing & behavior | Spell ids the Infinity AI must never cast. |
| **`robos:healThreshold`** | healThreshold | `0..*` | `xsd:string` | Testing & behavior | Heal an ally below this fraction of max HP (default 0.5). |
| **`robos:movement`** | movement | `0..*` | `xsd:string` | Testing & behavior | advance, hold or kite. |
| **`robos:scriptedInputs`** | scriptedInputs | `0..*` | `xsd:string` | Testing & behavior | Ordered robos:CRPGPlayerInput commands played before the AI takes over. |

---

## Canonical OSLC JSON-LD Example

```json
{
  "@id": "urn:robos:testing:infinity-ai-directive-sample",
  "@type": [
    "robos:InfinityAIDirective",
    "schema:ControlAction",
    "oslc:Resource"
  ],
  "dcterms:title": "Sample Infinity AI Directive",
  "dcterms:description": "Canonical reference instance for robos:InfinityAIDirective.",
  "robos:package": "testing",
  "robos:namespace": "robos.testing",
  "robos:schemaOrgType": "https://schema.org/ControlAction",
  "robos:domainStandard": "https://robos.dev/ns/crpg#InfinityAIDirective",
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
        "@id": "urn:robos:testing:infinity-ai-directive-sample",
        "@type": [
            "robos:InfinityAIDirective",
            "schema:ControlAction",
            "oslc:Resource"
        ],
        "dcterms:title": "Sample Infinity AI Directive",
        "dcterms:description": "Canonical reference instance for robos:InfinityAIDirective.",
        "robos:package": "testing",
        "robos:namespace": "robos.testing",
        "robos:schemaOrgType": "https://schema.org/ControlAction",
        "robos:domainStandard": "https://robos.dev/ns/crpg#InfinityAIDirective",
        "robos:refersFrom": "https://schema.org/Action"
    }
  ],
}));

console.log("Conforms:", result.conforms); // Expected: true
```