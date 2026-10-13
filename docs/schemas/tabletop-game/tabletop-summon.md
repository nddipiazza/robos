---
title: Tabletop Summon
layout: default
parent: "Games: Tabletop"
grand_parent: Schemas
nav_order: 4
permalink: /schemas/tabletop-game/tabletop-summon.html
---

# robos:TabletopSummon
{: .no_toc }

Validation shape for `robos:TabletopSummon` nodes in the `tabletop-game` package group.
{: .fs-6 }

## Details

| Detail | Value |
|---|---|
| Class | `robos:TabletopSummon` |
| Shape id | `urn:robos:shape:TabletopSummonShape` |
| Package | [Games: Tabletop]({{ '/schemas/tabletop-game.html' | relative_url }}) (`tabletop-game`) |
| Schema.org type | [`schema:Person`](https://schema.org/Person) |
| Domain standard | [robos.dev](https://robos.dev/ns/tabletop#Summon) |

## Properties

Count is the minimum and maximum number of values (`*` means no maximum). The validator enforces both. The type column is documentation only; the validator does not check types.

| Property | Count | Type | Rule or description |
|---|---|---|---|
| `dcterms:title` | `1..*` | `xsd:string` | Tabletop summon must have a name. |
| `robos:summoner` | `1..*` | - | Tabletop summon must declare its hero summoner. |
| `robos:bodyPoints` | `1..*` | - | Tabletop summon must declare Body Points. |
| `robos:mindPoints` | `1..*` | - | Tabletop summon must declare Mind Points. |
| `robos:attackDice` | `1..*` | - | Tabletop summon must declare attack dice. |
| `robos:defendDice` | `1..*` | - | Tabletop summon must declare defend dice. |
| `robos:movementSquares` | `1..*` | - | Tabletop summon must declare movement speed in squares. |

## Example node

This node comes from `.robos/kgraphs/tabletop-game/package.jsonld` in the RobOS repository. That graph holds sample data for a fictional company, so treat the values as illustrations.

{% raw %}
```json
{
  "@id": "urn:robos:tabletop:summon:wizard-wolf",
  "@type": [
    "oslc_am:Resource",
    "robos:TabletopSummon",
    "robos:GameCharacter",
    "schema:Person"
  ],
  "dcterms:title": "Summoned Wolf",
  "dcterms:description": "Spectral beast companion conjured by the Wizard to fight in battle. Has reduced functionality and acts immediately following the Wizard.",
  "robos:summoner": "urn:robos:tabletop:hero:wizard",
  "robos:bodyPoints": 2,
  "robos:mindPoints": 1,
  "robos:attackDice": 2,
  "robos:defendDice": 2,
  "robos:movementSquares": 8,
  "robos:tokenColor": "#38bdf8",
  "robos:tokenKey": "wolf",
  "robos:reducedFunctionality": true,
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
