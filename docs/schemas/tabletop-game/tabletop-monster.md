---
title: Tabletop Monster
layout: default
parent: "Games: Tabletop"
grand_parent: Schemas
nav_order: 3
permalink: /schemas/tabletop-game/tabletop-monster.html
---

# robos:TabletopMonster
{: .no_toc }

Validation shape for `robos:TabletopMonster` nodes in the `tabletop-game` package group.
{: .fs-6 }

## Details

| Detail | Value |
|---|---|
| Class | `robos:TabletopMonster` |
| Shape id | `urn:robos:shape:TabletopMonsterShape` |
| Package | [Games: Tabletop]({{ '/schemas/tabletop-game.html' | relative_url }}) (`tabletop-game`) |
| Classification | Testing & behavior |
| Schema.org type | [`schema:Person`](https://schema.org/Person) |
| Domain standard | [robos.dev](https://robos.dev/ns/tabletop#Monster) |

## Properties

Count is the minimum and maximum number of values (`*` means no maximum). The validator enforces both. The type column is documentation only; the validator does not check types.

| Property | Count | Type | Rule or description |
|---|---|---|---|
| `dcterms:title` | `1..*` | `xsd:string` | Tabletop monster must have a name. |
| `robos:bodyPoints` | `1..*` | - | Tabletop monster must declare Body Points. |
| `robos:attackDice` | `1..*` | - | Tabletop monster must declare attack dice. |
| `robos:defendDice` | `1..*` | - | Tabletop monster must declare defend dice. |
| `robos:movementSquares` | `1..*` | - | Tabletop monster must declare movement speed in squares. |

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
