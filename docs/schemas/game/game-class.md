---
title: Game Class
layout: default
parent: "Games: Rules"
grand_parent: Schemas
nav_order: 2
permalink: /schemas/game/game-class.html
---

# robos:GameClass
{: .no_toc }

Validation shape for `robos:GameClass` nodes in the `game` package group.
{: .fs-6 }

## Details

| Detail | Value |
|---|---|
| Class | `robos:GameClass` |
| Shape id | `urn:robos:shape:GameClassShape` |
| Package | [Games: Rules]({{ '/schemas/game.html' | relative_url }}) (`game`) |
| Schema.org type | [`schema:Role`](https://schema.org/Role) |

## Properties

Count is the minimum and maximum number of values (`*` means no maximum). The validator enforces both. The type column is documentation only; the validator does not check types.

| Property | Count | Type | Rule or description |
|---|---|---|---|
| `dcterms:title` | `1..*` | `xsd:string` | Game class must have a title. |

## Example node

This node comes from `.robos/kgraphs/game/package.jsonld` in the RobOS repository. That graph holds sample data for a fictional company, so treat the values as illustrations.

{% raw %}
```json
{
  "@id": "urn:robos:game:class:elf",
  "@type": [
    "oslc_am:Resource",
    "robos:GameClass",
    "schema:Role"
  ],
  "dcterms:title": "Elf Champion",
  "robos:primaryAbility": "DEX",
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
