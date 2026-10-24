---
title: Game Spell
layout: default
parent: "Game Rules (robos.game)"
grand_parent: Schemas
nav_order: 5
permalink: /schemas/game/game-spell.html
description: "Validation shape for robos:GameSpell nodes in the game package group."
---

# robos:GameSpell
{: .no_toc }

Validation shape for `robos:GameSpell` nodes in the `game` package group.
{: .fs-6 }

## Details

| | |
|---|---|
| Class | `robos:GameSpell` |
| Shape id | `urn:robos:shape:GameSpellShape` |
| Package | [Game Rules (robos.game)]({{ '/schemas/game.html' | relative_url }}) (`game`) |
| Schema.org type | [`schema:Action`](https://schema.org/Action) |
| Domain standard | [robos.dev](https://robos.dev/ns/game#Spell) |

## Properties

Count is the minimum and maximum number of values (`*` means no maximum). The validator enforces both. The type column is documentation only; the validator does not check types.

| Property | Count | Type | Rule or description |
|---|---|---|---|
| `dcterms:title` | `1..*` | `xsd:string` | Game spell must have a name. |

## Example node

This node comes from `.robos/kgraphs/game/package.jsonld` in the RobOS repository. That graph holds sample data for a fictional company, so treat the values as illustrations.

{% raw %}
```json
{
  "@id": "urn:robos:game:spell:sleep",
  "@type": [
    "oslc_am:Resource",
    "robos:GameSpell",
    "schema:Action"
  ],
  "dcterms:title": "Sleep",
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
