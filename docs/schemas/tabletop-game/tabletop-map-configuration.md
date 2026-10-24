---
title: Tabletop Map Configuration
layout: default
parent: "Tabletop Game (robos.tabletop)"
grand_parent: Schemas
nav_order: 6
permalink: /schemas/tabletop-game/tabletop-map-configuration.html
description: "Validation shape for robos:TabletopMapConfiguration nodes in the tabletop-game package group."
---

# robos:TabletopMapConfiguration
{: .no_toc }

Validation shape for `robos:TabletopMapConfiguration` nodes in the `tabletop-game` package group.
{: .fs-6 }

## Details

| | |
|---|---|
| Class | `robos:TabletopMapConfiguration` |
| Shape id | `urn:robos:shape:TabletopMapConfigurationShape` |
| Package | [Tabletop Game (robos.tabletop)]({{ '/schemas/tabletop-game.html' | relative_url }}) (`tabletop-game`) |
| Classification | Testing & behavior |
| Schema.org type | [`schema:Place`](https://schema.org/Place) |
| Domain standard | [robos.dev](https://robos.dev/ns/tabletop#MapConfiguration) |

## Properties

Count is the minimum and maximum number of values (`*` means no maximum). The validator enforces both. The type column is documentation only; the validator does not check types.

| Property | Count | Type | Rule or description |
|---|---|---|---|
| `dcterms:title` | `1..*` | `xsd:string` | Tabletop map configuration must declare a title. |
| `robos:gridDimensions` | `1..*` | - | Tabletop map configuration must declare grid dimensions [width, height]. |

## Example node

This node comes from `.robos/kgraphs/tabletop-game/package.jsonld` in the RobOS repository. That graph holds sample data for a fictional company, so treat the values as illustrations.

{% raw %}
```json
{
  "@id": "urn:robos:tabletop:mapconfig:heroquest-classic",
  "@type": [
    "oslc_am:Resource",
    "robos:TabletopMapConfiguration",
    "schema:Place"
  ],
  "dcterms:title": "HeroQuest Classic Stone Dungeon (Side A)",
  "robos:boardSide": "A",
  "robos:gridDimensions": [
    26,
    19
  ],
  "robos:backgroundImage": "res://assets/boards/heroquest_board.png",
  "robos:roomsCount": 17,
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
