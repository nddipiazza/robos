---
title: Game Item
layout: default
parent: "Games: Rules"
grand_parent: Schemas
nav_order: 4
permalink: /schemas/game/game-item.html
---

# robos:GameItem
{: .no_toc }

Validation shape for `robos:GameItem` nodes in the `game` package group.
{: .fs-6 }

## Details

| Detail | Value |
|---|---|
| Class | `robos:GameItem` |
| Shape id | `urn:robos:shape:GameItemShape` |
| Package | [Games: Rules]({{ '/schemas/game.html' | relative_url }}) (`game`) |
| Schema.org type | [`schema:Product`](https://schema.org/Product) |
| Domain standard | [robos.dev](https://robos.dev/ns/game#Item) |

## Properties

Count is the minimum and maximum number of values (`*` means no maximum). The validator enforces both. The type column is documentation only; the validator does not check types.

| Property | Count | Type | Rule or description |
|---|---|---|---|
| `dcterms:title` | `1..*` | `xsd:string` | Game item must have a name. |

## Example node

This node comes from `.robos/kgraphs/game/package.jsonld` in the RobOS repository. That graph holds sample data for a fictional company, so treat the values as illustrations.

{% raw %}
```json
{
  "@id": "urn:robos:game:item:dagger",
  "@type": [
    "oslc_am:Resource",
    "robos:GameItem",
    "schema:Product"
  ],
  "dcterms:title": "Dagger",
  "robos:itemCategory": "weapon",
  "robos:cost": 25,
  "robos:package": "game",
  "robos:namespace": "robos.game"
}
```
{% endraw %}

## Validate the example

Save the example as `node.json` in the repository root, then run:

```bash
node -e "const { SHACLValidator } = require('./packages/robos-graph/lib/shacl-validator'); console.log(new SHACLValidator().validate([require('./node.json')]).conforms)"
```

The command prints `true` when the node meets every rule for its types.
