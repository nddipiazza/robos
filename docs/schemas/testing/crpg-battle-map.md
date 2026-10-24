---
title: CRPG Battle Map
layout: default
parent: "Testing, Quality & BDD (robos.testing)"
grand_parent: Schemas
nav_order: 4
permalink: /schemas/testing/crpg-battle-map.html
description: "Validation shape for robos:CRPGBattleMap nodes in the testing package group."
---

# robos:CRPGBattleMap
{: .no_toc }

Validation shape for `robos:CRPGBattleMap` nodes in the `testing` package group.
{: .fs-6 }

## Details

| | |
|---|---|
| Class | `robos:CRPGBattleMap` |
| Shape id | `urn:robos:shape:CRPGBattleMapShape` |
| Package | [Testing, Quality & BDD (robos.testing)]({{ '/schemas/testing.html' | relative_url }}) (`testing`) |
| Classification | Testing & behavior |
| Schema.org type | [`schema:Place`](https://schema.org/Place) |

## Properties

Count is the minimum and maximum number of values (`*` means no maximum). The validator enforces both. The type column is documentation only; the validator does not check types.

| Property | Count | Type | Rule or description |
|---|---|---|---|
| `dcterms:title` | `1..*` | `xsd:string` | Battle map must have a title. |
| `robos:width` | `1..*` | - | Battle map must declare its width in feet. |
| `robos:height` | `1..*` | - | Battle map must declare its height in feet. |
| `robos:mapZone` | `0..*` | - | Optional link to the robos:CRPGMapZone this battle takes place in. |
| `robos:terrain` | `0..*` | - | Floor terrain for the blockout image: stone, grass, dirt, sand, wood, snow or cave. |
| `robos:mapObjects` | `0..*` | - | Static scene objects (robos:CRPGMapObject): walls, buildings, doors, trees, props. |
| `robos:blockout` | `0..*` | - | 5-ft collision grid (blocked, opaque, difficult, cover) written by robos-crpg-blockout build. |
| `robos:backgroundImage` | `0..*` | - | Blockout background image rendered by robos-crpg-blockout (res:// path). |

## Example node

The checked-in graph has no node of this class that passes the validator, so this is a placeholder built from the shape. It has every required property, with example values. It is not a node from the graph.

{% raw %}
```json
{
  "@id": "urn:robos:testing:crpg-battle-map-sample",
  "@type": [
    "robos:CRPGBattleMap",
    "schema:Place",
    "oslc:Resource"
  ],
  "dcterms:title": "Sample CRPG Battle Map",
  "dcterms:description": "Placeholder node for robos:CRPGBattleMap.",
  "robos:package": "testing",
  "robos:namespace": "robos.testing",
  "robos:width": "<width>",
  "robos:height": "<height>",
  "robos:schemaOrgType": "https://schema.org/Place",
  "robos:domainStandard": "https://schema.org/Place",
  "robos:refersFrom": "https://schema.org/Place"
}
```
{% endraw %}

## Validate the example

Save the example as `node.json` in the repository root, then run:

```bash
node -e "const { SHACLValidator } = require('./packages/robos-graph/lib/shacl-validator'); console.log(new SHACLValidator().validate([require('./node.json')]).conforms)"
```

The command prints `true` when the node meets every rule for its types.
