---
title: Tabletop AI Engine
layout: default
parent: "Games: Tabletop"
grand_parent: Schemas
nav_order: 9
permalink: /schemas/tabletop-game/tabletop-ai-engine.html
---

# robos:TabletopAIEngine
{: .no_toc }

Validation shape for `robos:TabletopAIEngine` nodes in the `tabletop-game` package group.
{: .fs-6 }

## Details

| Detail | Value |
|---|---|
| Class | `robos:TabletopAIEngine` |
| Shape id | `urn:robos:shape:TabletopAIEngineShape` |
| Package | [Games: Tabletop]({{ '/schemas/tabletop-game.html' | relative_url }}) (`tabletop-game`) |
| Classification | Testing & behavior |
| Schema.org type | [`schema:SoftwareApplication`](https://schema.org/SoftwareApplication) |
| Domain standard | [robos.dev](https://robos.dev/ns/tabletop#AIEngine) |

## Properties

Count is the minimum and maximum number of values (`*` means no maximum). The validator enforces both. The type column is documentation only; the validator does not check types.

| Property | Count | Type | Rule or description |
|---|---|---|---|
| `dcterms:title` | `1..*` | `xsd:string` | Tabletop AI Engine must have a title. |
| `robos:engineId` | `1..*` | - | Tabletop AI Engine must declare an engine id. |
| `robos:role` | `1..*` | - | Tabletop AI Engine must declare a role (hero_companion, game_master, autonomous_player). |
| `robos:controllerModes` | `1..*` | - | Tabletop AI Engine must declare supported controller modes. |
| `robos:decisionPipeline` | `1..*` | - | Tabletop AI Engine must declare its tactical decision pipeline. |

## Example node

This node comes from `.robos/kgraphs/tabletop-game/package.jsonld` in the RobOS repository. That graph holds sample data for a fictional company, so treat the values as illustrations.

{% raw %}
```json
{
  "@id": "urn:robos:tabletop:ai-engine:zargon-dungeon-master",
  "@type": [
    "oslc_am:Resource",
    "robos:TabletopAIEngine",
    "schema:SoftwareApplication"
  ],
  "dcterms:title": "Zargon Dungeon Master AI Engine",
  "dcterms:description": "Adversarial AI engine activating surviving monsters during the Zargon phase to track hero positions, advance through open doorways, and coordinate melee counterattacks.",
  "robos:engineId": "zargon-dungeon-master",
  "robos:role": "game_master",
  "robos:controllerModes": [
    "autonomous_ai",
    "scripted",
    "idle"
  ],
  "robos:decisionPipeline": [
    "detect_hero_in_room",
    "advance_to_hero",
    "melee_attack_hero",
    "cast_dread_spell",
    "end_phase"
  ],
  "robos:humanGovernance": "automated",
  "robos:restApiPort": 18092,
  "robos:package": "tabletop-game",
  "robos:namespace": "robos.tabletop"
}
```
{% endraw %}

## Validate the example

Save the example as `node.json` in the repository root, then run:

```bash
node -e "const { SHACLValidator } = require('./packages/robos-graph/lib/shacl-validator'); console.log(new SHACLValidator().validate([require('./node.json')]).conforms)"
```

The command prints `true` when the node meets every rule for its types.
