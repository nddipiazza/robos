---
title: Tabletop Turn DAG
layout: default
parent: "Tabletop Game (robos.tabletop)"
grand_parent: Schemas
nav_order: 7
permalink: /schemas/tabletop-game/tabletop-turn-dag.html
description: "Validation shape for robos:TabletopTurnDAG nodes in the tabletop-game package group."
---

# robos:TabletopTurnDAG
{: .no_toc }

Validation shape for `robos:TabletopTurnDAG` nodes in the `tabletop-game` package group.
{: .fs-6 }

## Details

| | |
|---|---|
| Class | `robos:TabletopTurnDAG` |
| Shape id | `urn:robos:shape:TabletopTurnDAGShape` |
| Package | [Tabletop Game (robos.tabletop)]({{ '/schemas/tabletop-game.html' | relative_url }}) (`tabletop-game`) |
| Classification | Testing & behavior |
| Schema.org type | [`schema:Action`](https://schema.org/Action) |
| Domain standard | [robos.dev](https://robos.dev/ns/tabletop#TurnDAG) |

## Properties

Count is the minimum and maximum number of values (`*` means no maximum). The validator enforces both. The type column is documentation only; the validator does not check types.

| Property | Count | Type | Rule or description |
|---|---|---|---|
| `dcterms:title` | `1..*` | `xsd:string` | Tabletop turn DAG must declare a title. |
| `robos:rootStepId` | `1..*` | - | Tabletop turn DAG must declare a root entry step ID. |
| `robos:turnSteps` | `1..*` | - | Tabletop turn DAG must declare turn steps. |

## Example node

This node comes from `.robos/kgraphs/tabletop-game/package.jsonld` in the RobOS repository. That graph holds sample data for a fictional company, so treat the values as illustrations.

{% raw %}
```json
{
  "@id": "urn:robos:tabletop:flow:heroquest-turn-cycle",
  "@type": [
    "oslc_am:Resource",
    "robos:TabletopTurnDAG",
    "schema:Action"
  ],
  "dcterms:title": "HeroQuest Authentic Turn Cycle & Action State Machine",
  "dcterms:description": "Directed Acyclic Graph governing turn progression: active hero selection, movement dice roll, spatial navigation, conditional action choice (melee attack, door breach, treasure search, spellcasting), and Zargon GM phase transition.",
  "robos:rootStepId": "step-turn-start",
  "robos:turnSteps": [
    {
      "@type": "robos:TabletopTurnStep",
      "id": "step-turn-start",
      "dcterms:title": "Active Hero Turn Start & Awaiting Movement",
      "robos:stepType": "awaiting_roll",
      "robos:primaryAction": "roll_movement_dice",
      "robos:allowedActions": [
        "roll_movement_dice",
        "melee_attack",
        "cast_spell"
      ],
      "robos:prompt": "Roll 2d6 to determine movement, or perform an immediate action."
    },
    {
      "@type": "robos:TabletopTurnStep",
      "id": "step-movement-phase",
      "dcterms:title": "Movement & Spatial Exploration",
      "robos:stepType": "moving",
      "robos:primaryAction": "move_hero",
      "robos:allowedActions": [
        "move_hero",
        "open_door",
        "melee_attack",
        "search_room",
        "cast_spell",
        "end_turn"
      ],
      "robos:prompt": "Spend movement squares on the board, or execute an available action."
    },
    {
      "@type": "robos:TabletopTurnStep",
      "id": "step-action-selection",
      "dcterms:title": "Situational Action Execution",
      "robos:stepType": "action_execution",
      "robos:allowedActions": [
        "melee_attack",
        "search_room",
        "cast_spell",
        "open_door"
      ],
      "robos:prompt": "Perform one combat, search, or spell action allowed per turn."
    },
    {
      "@type": "robos:TabletopTurnStep",
      "id": "step-post-action",
      "dcterms:title": "Post-Action Movement & Turn Conclusion",
      "robos:stepType": "action_taken",
      "robos:allowedActions": [
        "move_hero",
        "end_turn"
      ],
      "robos:prompt": "Action completed. Spend remaining movement squares or end turn."
    },
    {
      "@type": "robos:TabletopTurnStep",
      "id": "step-turn-end",
      "dcterms:title": "Turn Resolution & Party Progression",
      "robos:stepType": "turn_complete",
      "robos:allowedActions": [
        "next_hero",
        "trigger_gm_phase"
      ],
      "robos:prompt": "Turn finished. Pass control to next hero or begin Zargon phase."
    }
  ],
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
