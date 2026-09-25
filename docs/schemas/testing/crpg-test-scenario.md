---
title: CRPG Test Scenario
layout: default
parent: Testing, Quality & BDD (robos.testing)
grand_parent: KGraph Schemas
nav_order: 3
permalink: /schemas/testing/crpg-test-scenario.html
---

# Schema: `robos:CRPGTestScenario`
{: .no_toc }

Formal W3C SHACL constraint shape and OSLC JSON-LD specification for `robos:CRPGTestScenario` in the `testing` package store.
{: .fs-6 .fw-300 }

## Table of contents
{: .no_toc .text-delta }

1. TOC
{:toc}

---

## Specification Metadata

- **RDF / OWL Class**: `robos:CRPGTestScenario`
- **Aliases / Target Classes**: `robos:CRPGTestScenario`
- **SHACL Shape ID**: `urn:robos:shape:CRPGTestScenarioShape`
- **Governing Package**: [Testing, Quality & BDD (robos.testing)]({{ '/schemas/testing.html' | relative_url }}) (`testing`)
- **Namespace**: `robos.testing`
- **Schema.org Classification**: [https://schema.org/CheckAction](https://schema.org/CheckAction)
- **Domain De Facto Standard**: [http://open-services.net/ns/qm#TestCase](http://open-services.net/ns/qm#TestCase)
- **Upstream Schema Basis (Refers From)**: [http://open-services.net/ns/qm#TestCase](http://open-services.net/ns/qm#TestCase)

---

## Upstream Schema Basis (Refers From) & Global Standards Provenance

This RobOS schema is modeled after and directly aligns with two levels of global standards:
- **Universal Schema.org Class**: [https://schema.org/CheckAction](https://schema.org/CheckAction) (100% interoperability with search engines, web indexers, and general AI reasoning)
- **Specialized Domain Standard**: [http://open-services.net/ns/qm#TestCase](http://open-services.net/ns/qm#TestCase) (de facto standard for domain-specific ALM, BDD, or infrastructure operations)
- **Canonical Reference**: [http://open-services.net/ns/qm#TestCase](http://open-services.net/ns/qm#TestCase)
- **Agent Guidelines**: When autonomous agents generate, expand, or validate instances of `robos:CRPGTestScenario`, they MUST adhere to and base their output on this referred schema object and universal Schema.org parent class, extending it with RobOS SDLC properties.

---

## Entity Relationship & Schema Context

<div style="margin: 1.5rem 0; padding: 1.25rem; background: #161b22; border: 1px solid #30363d; border-radius: 8px;">
  <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.75rem; flex-wrap: wrap; gap: 0.5rem;">
    <span style="font-size: 1.15rem; font-weight: 700; color: #38bdf8;">CRPG Test Scenario</span>
    <span style="font-family: monospace; background: #121927; color: #00e5ff; border: 1px solid rgba(0, 229, 255, 0.4); padding: 0.2rem 0.6rem; border-radius: 6px; font-size: 0.85rem;">robos:CRPGTestScenario</span>
  </div>
  <p style="margin-bottom: 0.75rem; font-size: 0.92rem; color: #c9d1d9;">Governed by W3C SHACL shape <code>urn:robos:shape:CRPGTestScenarioShape</code> within the <strong>Testing, Quality & BDD (robos.testing)</strong> (<code>robos.testing</code>) package store.</p>
  <div style="display: flex; flex-wrap: wrap; gap: 0.5rem; margin-top: 0.5rem;">
    <span style="background: #0d1117; border: 1px solid #21262d; padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.8rem; color: #8b949e;"><code>dcterms:title</code></span>
    <span style="background: #0d1117; border: 1px solid #21262d; padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.8rem; color: #8b949e;"><code>robos:seed</code></span>
    <span style="background: #0d1117; border: 1px solid #21262d; padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.8rem; color: #8b949e;"><code>robos:map</code></span>
    <span style="background: #0d1117; border: 1px solid #21262d; padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.8rem; color: #8b949e;"><code>robos:party</code></span>
    <span style="background: #0d1117; border: 1px solid #21262d; padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.8rem; color: #8b949e;"><code>robos:enemies</code></span>
    <span style="background: #0d1117; border: 1px solid #21262d; padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.8rem; color: #8b949e;"><code>robos:directives</code></span>
    <span style="background: #0d1117; border: 1px solid #21262d; padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.8rem; color: #8b949e;"><code>robos:traps</code></span>
    <span style="background: #0d1117; border: 1px solid #21262d; padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.8rem; color: #8b949e;"><code>robos:maxRounds</code></span>
    <span style="background: #0d1117; border: 1px solid #21262d; padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.8rem; color: #8b949e;"><code>robos:executionMode</code></span>
    <span style="background: #0d1117; border: 1px solid #21262d; padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.8rem; color: #8b949e;"><code>robos:reactions</code></span>
    <span style="background: #0d1117; border: 1px solid #21262d; padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.8rem; color: #8b949e;"><code>robos:dice</code></span>
  </div>
</div>

---

**RobOS classification:** Testing & behavior. These RobOS-owned codes use Schema.org CategoryCode vocabulary.

## Property Constraints & SHACL Rules

| Property Path | Name | Multiplicity | Data Type | Classification | Constraint Rule / Validation Message |
|---|---|---|---|---|---|
| **`dcterms:title`** | Title / Display Name | `1..*` | `xsd:string` | Services & processing, Applications & entry points, Contracts & data models, Data stores & messaging, Libraries & build systems, Infrastructure & delivery, Organization & people, Projects & work items, Source control & artifacts, Agents & MCP, Documentation & decisions, Learning & assessment, Testing & behavior | cRPG Test Scenario must have a title. |
| **`robos:seed`** | seed | `1..*` | `xsd:string` | Testing & behavior | cRPG Test Scenario must declare a dice seed so every run is reproducible. |
| **`robos:map`** | map | `1..*` | `xsd:string` | Testing & behavior | cRPG Test Scenario must declare its battle map (robos:CRPGBattleMap, inline or by URN). |
| **`robos:party`** | party | `1..*` | `xsd:string` | Testing & behavior | cRPG Test Scenario must declare at least one party combatant (robos:CRPGCombatant). |
| **`robos:enemies`** | enemies | `0..*` | `xsd:string` | Testing & behavior | Enemy combatants (robos:CRPGCombatant) are optional; a scenario may test exploration or traps only. |
| **`robos:directives`** | directives | `0..*` | `xsd:string` | Testing & behavior | Infinity AI directives (robos:InfinityAIDirective) steering party members or NPCs are optional; the engine's default AI plays everyone else. |
| **`robos:traps`** | traps | `0..*` | `xsd:string` | Testing & behavior | Traps placed on the map are optional. |
| **`robos:maxRounds`** | maxRounds | `0..*` | `xsd:string` | Testing & behavior | Round limit before the scenario ends in a timeout (default 30). |
| **`robos:executionMode`** | executionMode | `0..*` | `xsd:string` | Testing & behavior | Preferred run mode: human (video, BDD overlays and pauses) or backend (headless, fastest). |
| **`robos:reactions`** | reactions | `0..*` | `xsd:string` | Testing & behavior | Set false to disable reactions (Shield, Counterspell, opportunity attacks keep working). |
| **`robos:dice`** | dice | `0..*` | `xsd:string` | Testing & behavior | Scripted dice results consumed before random rolls, e.g. [{"d": 20, "v": 20}]. |

---

## Canonical OSLC JSON-LD Example

```json
{
  "@id": "urn:robos:testing:crpg-test-scenario-sample",
  "@type": [
    "robos:CRPGTestScenario",
    "schema:CheckAction",
    "oslc:Resource"
  ],
  "dcterms:title": "Sample CRPG Test Scenario",
  "dcterms:description": "Canonical reference instance for robos:CRPGTestScenario.",
  "robos:package": "testing",
  "robos:namespace": "robos.testing",
  "robos:schemaOrgType": "https://schema.org/CheckAction",
  "robos:domainStandard": "http://open-services.net/ns/qm#TestCase",
  "robos:refersFrom": "http://open-services.net/ns/qm#TestCase"
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
        "@id": "urn:robos:testing:crpg-test-scenario-sample",
        "@type": [
            "robos:CRPGTestScenario",
            "schema:CheckAction",
            "oslc:Resource"
        ],
        "dcterms:title": "Sample CRPG Test Scenario",
        "dcterms:description": "Canonical reference instance for robos:CRPGTestScenario.",
        "robos:package": "testing",
        "robos:namespace": "robos.testing",
        "robos:schemaOrgType": "https://schema.org/CheckAction",
        "robos:domainStandard": "http://open-services.net/ns/qm#TestCase",
        "robos:refersFrom": "http://open-services.net/ns/qm#TestCase"
    }
  ],
}));

console.log("Conforms:", result.conforms); // Expected: true
```