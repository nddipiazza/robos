---
title: Tabletop Quest Map
layout: default
parent: "Games: Tabletop"
grand_parent: Schemas
nav_order: 5
permalink: /schemas/tabletop-game/tabletop-quest-map.html
---

# robos:TabletopQuestMap
{: .no_toc }

Validation shape for `robos:TabletopQuestMap` nodes in the `tabletop-game` package group.
{: .fs-6 }

## Details

| Detail | Value |
|---|---|
| Class | `robos:TabletopQuestMap` |
| Shape id | `urn:robos:shape:TabletopQuestMapShape` |
| Package | [Games: Tabletop]({{ '/schemas/tabletop-game.html' | relative_url }}) (`tabletop-game`) |
| Classification | Testing & behavior |
| Schema.org type | [`schema:Place`](https://schema.org/Place) |
| Domain standard | [robos.dev](https://robos.dev/ns/tabletop#QuestMap) |

## Properties

Count is the minimum and maximum number of values (`*` means no maximum). The validator enforces both. The type column is documentation only; the validator does not check types.

| Property | Count | Type | Rule or description |
|---|---|---|---|
| `dcterms:title` | `1..*` | `xsd:string` | Quest map must declare a title. |
| `robos:startingSpawn` | `1..*` | - | Quest map must declare starting spawn coordinate. |

## Example node

This node comes from `.robos/kgraphs/tabletop-game/package.jsonld` in the RobOS repository. That graph holds sample data for a fictional company, so treat the values as illustrations.

{% raw %}
```json
{
  "@id": "urn:robos:tabletop:map:the-trial",
  "@type": [
    "oslc_am:Resource",
    "robos:TabletopQuestMap",
    "robos:GameMap",
    "schema:Place"
  ],
  "dcterms:title": "The Trial — Quest 1: Lair of the Orc Warlord",
  "robos:width": 26,
  "robos:height": 19,
  "robos:startingSpawn": [
    1,
    1
  ],
  "robos:backgroundImage": "res://assets/boards/heroquest_board.png",
  "robos:boss": "urn:robos:tabletop:monster:verag-orc-warlord",
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
