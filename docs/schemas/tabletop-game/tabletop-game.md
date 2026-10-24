---
title: Tabletop Game
layout: default
parent: "Tabletop Game (robos.tabletop)"
grand_parent: Schemas
nav_order: 1
permalink: /schemas/tabletop-game/tabletop-game.html
description: "Validation shape for robos:TabletopGame nodes in the tabletop-game package group."
---

# robos:TabletopGame
{: .no_toc }

Validation shape for `robos:TabletopGame` nodes in the `tabletop-game` package group.
{: .fs-6 }

## Details

| | |
|---|---|
| Class | `robos:TabletopGame` |
| Shape id | `urn:robos:shape:TabletopGameShape` |
| Package | [Tabletop Game (robos.tabletop)]({{ '/schemas/tabletop-game.html' | relative_url }}) (`tabletop-game`) |
| Classification | Testing & behavior |
| Schema.org type | [`schema:Game`](https://schema.org/Game) |
| Domain standard | [robos.dev](https://robos.dev/ns/tabletop#Game) |

## Properties

Count is the minimum and maximum number of values (`*` means no maximum). The validator enforces both. The type column is documentation only; the validator does not check types.

| Property | Count | Type | Rule or description |
|---|---|---|---|
| `dcterms:title` | `1..*` | `xsd:string` | Tabletop game must declare a title. |
| `robos:ruleset` | `1..*` | - | Tabletop game must declare a ruleset. |
| `robos:gridDimensions` | `1..*` | - | Tabletop game must declare grid dimensions [width, height]. |

## Example node

This node comes from `.robos/kgraphs/tabletop-game/package.jsonld` in the RobOS repository. That graph holds sample data for a fictional company, so treat the values as illustrations.

{% raw %}
```json
{
  "@id": "urn:robos:tabletop:game:heroquest",
  "@type": [
    "oslc_am:Resource",
    "robos:TabletopGame",
    "robos:Game",
    "schema:Game"
  ],
  "dcterms:title": "HeroQuest: The Gathering of Heroes",
  "robos:ruleset": "heroquest",
  "robos:gameType": "tabletop",
  "robos:gridDimensions": [
    26,
    19
  ],
  "robos:movementFormula": "2d6",
  "robos:startingZone": "urn:robos:tabletop:map:the-trial",
  "robos:combatDice": "3 skulls, 2 white shields, 1 black shield",
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
