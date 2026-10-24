---
title: Tabletop Hero
layout: default
parent: "Tabletop Game (robos.tabletop)"
grand_parent: Schemas
nav_order: 2
permalink: /schemas/tabletop-game/tabletop-hero.html
description: "Validation shape for robos:TabletopHero nodes in the tabletop-game package group."
---

# robos:TabletopHero
{: .no_toc }

Validation shape for `robos:TabletopHero` nodes in the `tabletop-game` package group.
{: .fs-6 }

## Details

| | |
|---|---|
| Class | `robos:TabletopHero` |
| Shape id | `urn:robos:shape:TabletopHeroShape` |
| Package | [Tabletop Game (robos.tabletop)]({{ '/schemas/tabletop-game.html' | relative_url }}) (`tabletop-game`) |
| Classification | Testing & behavior |
| Schema.org type | [`schema:Person`](https://schema.org/Person) |
| Domain standard | [robos.dev](https://robos.dev/ns/tabletop#Hero) |

## Properties

Count is the minimum and maximum number of values (`*` means no maximum). The validator enforces both. The type column is documentation only; the validator does not check types.

| Property | Count | Type | Rule or description |
|---|---|---|---|
| `dcterms:title` | `1..*` | `xsd:string` | Tabletop hero must have a name. |
| `robos:bodyPoints` | `1..*` | - | Tabletop hero must declare Body Points. |
| `robos:mindPoints` | `1..*` | - | Tabletop hero must declare Mind Points. |
| `robos:attackDice` | `1..*` | - | Tabletop hero must declare attack dice. |
| `robos:defendDice` | `1..*` | - | Tabletop hero must declare defend dice. |

## Example node

This node comes from `.robos/kgraphs/tabletop-game/package.jsonld` in the RobOS repository. That graph holds sample data for a fictional company, so treat the values as illustrations.

{% raw %}
```json
{
  "@id": "urn:robos:tabletop:hero:barbarian",
  "@type": [
    "oslc_am:Resource",
    "robos:TabletopHero",
    "robos:GameCharacter",
    "schema:Person"
  ],
  "dcterms:title": "Barbarian",
  "robos:bodyPoints": 8,
  "robos:mindPoints": 2,
  "robos:attackDice": 3,
  "robos:defendDice": 2,
  "robos:startingWeapon": "urn:robos:game:item:broadsword",
  "robos:tokenColor": "#b91c1c",
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
