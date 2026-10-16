---
title: Tabletop Test Scenario
layout: default
parent: "Testing, Quality & BDD (robos.testing)"
grand_parent: Schemas
nav_order: 9
permalink: /schemas/testing/tabletop-test-scenario.html
---

# robos:TabletopTestScenario
{: .no_toc }

Validation shape for `robos:TabletopTestScenario` nodes in the `testing` package group.
{: .fs-6 }

## Details

| | |
|---|---|
| Class | `robos:TabletopTestScenario` |
| Shape id | `urn:robos:shape:TabletopTestScenarioShape` |
| Package | [Testing, Quality & BDD (robos.testing)]({{ '/schemas/testing.html' | relative_url }}) (`testing`) |
| Classification | Testing & behavior |
| Schema.org type | [`schema:CheckAction`](https://schema.org/CheckAction) |
| Domain standard | [robos.dev](https://robos.dev/ns/tabletop#TestScenario) |
| Upstream reference | [OSLC QM](http://open-services.net/ns/qm#TestCase) |

## Properties

Count is the minimum and maximum number of values (`*` means no maximum). The validator enforces both. The type column is documentation only; the validator does not check types.

| Property | Count | Type | Rule or description |
|---|---|---|---|
| `dcterms:title` | `1..*` | `xsd:string` | Tabletop Test Scenario must have a title. |
| `robos:seed` | `1..*` | - | Tabletop Test Scenario must declare a dice seed for reproducibility. |
| `robos:party` | `1..*` | - | Tabletop Test Scenario must declare party combatants. |

## Example node

This node comes from `.robos/kgraphs/tabletop-game/package.jsonld` in the RobOS repository. That graph holds sample data for a fictional company, so treat the values as illustrations.

{% raw %}
```json
{
  "@id": "urn:robos:tabletop:scenario:orc-warlord-caverns",
  "@type": [
    "oslc_qm:TestCase",
    "robos:TabletopTestScenario",
    "schema:CheckAction"
  ],
  "dcterms:title": "Lair of the Orc Warlord: Great Cavern Assault",
  "dcterms:description": "Assault Ulag's cavern lair in First Light Caverns, disarm falling block traps, and defeat the Orc Warlord on his throne.",
  "robos:seed": 202,
  "robos:cartridge": "heroquest-the-trial",
  "robos:quest": "heroquest-lair-orc-warlord",
  "robos:mapConfiguration": "first-light-caverns",
  "robos:startingStair": [
    1,
    1
  ],
  "robos:maxRounds": 35,
  "robos:executionMode": "human",
  "robos:party": [
    {
      "@type": "robos:TabletopCombatant",
      "robos:actorId": "barbarian",
      "dcterms:title": "Barbarian",
      "robos:characterClass": "barbarian",
      "robos:gridPos": [
        1,
        1
      ],
      "robos:currentBp": 8,
      "robos:maxBp": 8,
      "robos:attackDice": 3,
      "robos:defendDice": 2
    },
    {
      "@type": "robos:TabletopCombatant",
      "robos:actorId": "dwarf",
      "dcterms:title": "Dwarf",
      "robos:characterClass": "dwarf",
      "robos:gridPos": [
        1,
        1
      ],
      "robos:currentBp": 7,
      "robos:maxBp": 7,
      "robos:attackDice": 2,
      "robos:defendDice": 2
    },
    {
      "@type": "robos:TabletopCombatant",
      "robos:actorId": "elf",
      "dcterms:title": "Elf",
      "robos:characterClass": "elf",
      "robos:gridPos": [
        1,
        1
      ],
      "robos:currentBp": 6,
      "robos:maxBp": 6,
      "robos:attackDice": 2,
      "robos:defendDice": 2
    },
    {
      "@type": "robos:TabletopCombatant",
      "robos:actorId": "wizard",
      "dcterms:title": "Wizard",
      "robos:characterClass": "wizard",
      "robos:gridPos": [
        1,
        1
      ],
      "robos:currentBp": 4,
      "robos:maxBp": 4,
      "robos:attackDice": 1,
      "robos:defendDice": 2
    }
  ],
  "robos:monsters": [
    {
      "@type": "robos:TabletopCombatant",
      "robos:actorId": "mon-warlord-ulag",
      "dcterms:title": "Orc Warlord Ulag",
      "robos:monster": "warlord",
      "robos:gridPos": [
        13,
        9
      ],
      "robos:currentBp": 3,
      "robos:maxBp": 3,
      "robos:attackDice": 4,
      "robos:defendDice": 3
    },
    {
      "@type": "robos:TabletopCombatant",
      "robos:actorId": "mon-goblin-scout",
      "dcterms:title": "Goblin Scout",
      "robos:monster": "goblin",
      "robos:gridPos": [
        5,
        5
      ],
      "robos:currentBp": 1,
      "robos:maxBp": 1,
      "robos:attackDice": 2,
      "robos:defendDice": 1
    }
  ],
  "robos:doors": [
    {
      "from": [
        10,
        5
      ],
      "to": [
        10,
        6
      ],
      "open": false
    }
  ],
  "robos:directives": [
    "urn:robos:tabletop:ai-directive:barbarian-frontline-striker",
    "urn:robos:tabletop:ai-directive:wizard-arcane-support",
    "urn:robos:tabletop:ai-directive:zargon-monster-retaliation"
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
