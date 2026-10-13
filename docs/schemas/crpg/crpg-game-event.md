---
title: CRPG Game Event
layout: default
parent: "cRPG (robos.crpg)"
grand_parent: Schemas
nav_order: 4
permalink: /schemas/crpg/crpg-game-event.html
---

# robos:CRPGGameEvent
{: .no_toc }

Validation shape for `robos:CRPGGameEvent` nodes in the `crpg` package group.
{: .fs-6 }

## Details

| | |
|---|---|
| Class | `robos:CRPGGameEvent` |
| Shape id | `urn:robos:shape:CRPGGameEventShape` |
| Package | [cRPG (robos.crpg)]({{ '/schemas/crpg.html' | relative_url }}) (`crpg`) |
| Classification | Testing & behavior |
| Schema.org type | [`schema:Event`](https://schema.org/Event) |
| Domain standard | [robos.dev](https://robos.dev/ns/crpg#GameEvent) |

## Properties

Count is the minimum and maximum number of values (`*` means no maximum). The validator enforces both. The type column is documentation only; the validator does not check types.

| Property | Count | Type | Rule or description |
|---|---|---|---|
| `dcterms:title` | `1..*` | `xsd:string` | Game event must have a title. |
| `robos:eventType` | `1..*` | - | Game event must declare an event type (dialogue, combat_victory, area_transition, cutscene, item_acquisition, quest_milestone, decision_branch). |
| `robos:infinityInteraction` | `1..*` | - | Game event must declare an Infinity Engine interaction specification. |

## Example node

This node comes from `.robos/kgraphs/crpg/package.jsonld` in the RobOS repository. That graph holds sample data for a fictional company, so treat the values as illustrations.

{% raw %}
```json
{
  "@id": "urn:robos:crpg:event:evt-shadow-succumb-defeat",
  "@type": [
    "oslc_am:Resource",
    "robos:CRPGGameEvent",
    "schema:Event"
  ],
  "dcterms:title": "Consumed by Shadows: Game Over",
  "dcterms:description": "Falling in the dark wilderness without allies or guidance.",
  "robos:eventType": "cutscene",
  "robos:infinityInteraction": {
    "robos:interactionType": "cutscene_trigger",
    "robos:scriptVm": "urn:robos:infinity:subsystem:bcs-script-vm",
    "robos:dialogueMachine": "urn:robos:infinity:subsystem:dialogue-state-machine",
    "robos:bcsTrigger": "HP(Player1, 0)",
    "robos:bcsAction": "SetGlobal(\"lost_in_wilds\", \"GLOBAL\", 1)\nGameOver(DEFEAT)",
    "robos:journalEntry": "Succumbed in the cold wilderness of the Coast Way."
  },
  "robos:stateMutations": {
    "setFlags": {
      "lost_in_wilds": true
    }
  },
  "robos:package": "crpg",
  "robos:namespace": "robos.crpg"
}
```
{% endraw %}

## Validate the example

Save the example as `node.json` in the repository root, then run:

```bash
node -e "const { SHACLValidator } = require('./packages/robos-graph/lib/shacl-validator'); console.log(new SHACLValidator().validate([require('./node.json')]).conforms)"
```

The command prints `true` when the node meets every rule for its types.
