---
title: Game Monster
layout: default
parent: "Games: Rules"
grand_parent: Schemas
nav_order: 3
permalink: /schemas/game/game-monster.html
---

# robos:GameMonster
{: .no_toc }

Validation shape for `robos:GameMonster` nodes in the `game` package group.
{: .fs-6 }

## Details

| Detail | Value |
|---|---|
| Class | `robos:GameMonster` |
| Shape id | `urn:robos:shape:GameMonsterShape` |
| Package | [Games: Rules]({{ '/schemas/game.html' | relative_url }}) (`game`) |
| Schema.org type | [`schema:Person`](https://schema.org/Person) |
| Domain standard | [robos.dev](https://robos.dev/ns/game#Monster) |

## Properties

Count is the minimum and maximum number of values (`*` means no maximum). The validator enforces both. The type column is documentation only; the validator does not check types.

| Property | Count | Type | Rule or description |
|---|---|---|---|
| `dcterms:title` | `1..*` | `xsd:string` | Game monster must have a name. |

## Example node

This node comes from `.robos/kgraphs/tabletop-game/package.jsonld` in the RobOS repository. That graph holds sample data for a fictional company, so treat the values as illustrations.

{% raw %}
```json
{
  "@id": "urn:robos:tabletop:monster:orc",
  "@type": [
    "oslc_am:Resource",
    "robos:TabletopMonster",
    "robos:GameMonster",
    "schema:Person"
  ],
  "dcterms:title": "Orc",
  "robos:bodyPoints": 1,
  "robos:attackDice": 3,
  "robos:defendDice": 2,
  "robos:movementSquares": 8,
  "robos:tokenColor": "#047857",
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
