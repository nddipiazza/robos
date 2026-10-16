---
title: CRPG Test Scenario
layout: default
parent: "Testing, Quality & BDD (robos.testing)"
grand_parent: Schemas
nav_order: 3
permalink: /schemas/testing/crpg-test-scenario.html
---

# robos:CRPGTestScenario
{: .no_toc }

Validation shape for `robos:CRPGTestScenario` nodes in the `testing` package group.
{: .fs-6 }

## Details

| | |
|---|---|
| Class | `robos:CRPGTestScenario` |
| Shape id | `urn:robos:shape:CRPGTestScenarioShape` |
| Package | [Testing, Quality & BDD (robos.testing)]({{ '/schemas/testing.html' | relative_url }}) (`testing`) |
| Classification | Testing & behavior |
| Schema.org type | [`schema:CheckAction`](https://schema.org/CheckAction) |
| Domain standard | [OSLC QM](http://open-services.net/ns/qm#TestCase) |

## Properties

Count is the minimum and maximum number of values (`*` means no maximum). The validator enforces both. The type column is documentation only; the validator does not check types.

| Property | Count | Type | Rule or description |
|---|---|---|---|
| `dcterms:title` | `1..*` | `xsd:string` | cRPG Test Scenario must have a title. |
| `robos:seed` | `1..*` | - | cRPG Test Scenario must declare a dice seed so every run is reproducible. |
| `robos:map` | `1..*` | - | cRPG Test Scenario must declare its battle map (robos:CRPGBattleMap, inline or by URN). |
| `robos:party` | `1..*` | - | cRPG Test Scenario must declare at least one party combatant (robos:CRPGCombatant). |
| `robos:enemies` | `0..*` | - | Enemy combatants (robos:CRPGCombatant) are optional; a scenario may test exploration or traps only. |
| `robos:directives` | `0..*` | - | Infinity AI directives (robos:InfinityAIDirective) steering party members or NPCs are optional; the engine's default AI plays everyone else. |
| `robos:traps` | `0..*` | - | Traps placed on the map are optional. |
| `robos:maxRounds` | `0..*` | - | Round limit before the scenario ends in a timeout (default 30). |
| `robos:executionMode` | `0..*` | - | Preferred run mode: human (video, BDD overlays and pauses) or backend (headless, fastest). |
| `robos:reactions` | `0..*` | - | Set false to disable reactions (Shield, Counterspell, opportunity attacks keep working). |
| `robos:dice` | `0..*` | - | Scripted dice results consumed before random rolls, e.g. [{"d": 20, "v": 20}]. |

## Example node

The checked-in graph has no node of this class that passes the validator, so this is a placeholder built from the shape. It has every required property, with example values. It is not a node from the graph.

{% raw %}
```json
{
  "@id": "urn:robos:testing:crpg-test-scenario-sample",
  "@type": [
    "robos:CRPGTestScenario",
    "schema:CheckAction",
    "oslc:Resource"
  ],
  "dcterms:title": "Sample CRPG Test Scenario",
  "dcterms:description": "Placeholder node for robos:CRPGTestScenario.",
  "robos:package": "testing",
  "robos:namespace": "robos.testing",
  "robos:seed": "<seed>",
  "robos:map": "<map>",
  "robos:party": "<party>",
  "robos:schemaOrgType": "https://schema.org/CheckAction",
  "robos:domainStandard": "http://open-services.net/ns/qm#TestCase",
  "robos:refersFrom": "http://open-services.net/ns/qm#TestCase"
}
```
{% endraw %}

## Validate the example

Save the example as `node.json` in the repository root, then run:

```bash
node -e "const { SHACLValidator } = require('./packages/robos-graph/lib/shacl-validator'); console.log(new SHACLValidator().validate([require('./node.json')]).conforms)"
```

The command prints `true` when the node meets every rule for its types.
