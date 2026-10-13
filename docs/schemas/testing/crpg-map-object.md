---
title: CRPG Map Object
layout: default
parent: "Testing, Quality & BDD (robos.testing)"
grand_parent: Schemas
nav_order: 5
permalink: /schemas/testing/crpg-map-object.html
---

# robos:CRPGMapObject
{: .no_toc }

Validation shape for `robos:CRPGMapObject` nodes in the `testing` package group.
{: .fs-6 }

## Details

| | |
|---|---|
| Class | `robos:CRPGMapObject` |
| Shape id | `urn:robos:shape:CRPGMapObjectShape` |
| Package | [Testing, Quality & BDD (robos.testing)]({{ '/schemas/testing.html' | relative_url }}) (`testing`) |
| Classification | Testing & behavior |
| Schema.org type | [`schema:Place`](https://schema.org/Place) |
| Domain standard | [robos.dev](https://robos.dev/ns/crpg#MapObject) |

## Properties

Count is the minimum and maximum number of values (`*` means no maximum). The validator enforces both. The type column is documentation only; the validator does not check types.

| Property | Count | Type | Rule or description |
|---|---|---|---|
| `robos:objectId` | `1..*` | - | Map object must have an object id. |
| `robos:objectType` | `1..*` | - | Map object must declare its type: wall, building, door, pillar, tree, rock, statue, crate, barrel, table, altar, bed, chest, fence, pit, water, bush, rubble, stairs, road, bridge, rug or zone. |
| `robos:shape` | `1..*` | - | Map object must declare its shape: rect, circle, line or polygon. |
| `robos:position` | `1..*` | - | Map object must have a position in feet (rect top-left, circle centre, line start). |
| `robos:size` | `0..*` | - | Rect width and height in feet. |
| `robos:radius` | `0..*` | - | Circle radius in feet. |
| `robos:to` | `0..*` | - | Line end point in feet. |
| `robos:thickness` | `0..*` | - | Line thickness in feet (default 5). |
| `robos:points` | `0..*` | - | Polygon vertices in feet. |
| `robos:open` | `0..*` | - | Doors: true for an open door that creatures and sight pass through. |
| `robos:blocksMovement` | `0..*` | - | Override the type default for blocking movement. |
| `robos:blocksSight` | `0..*` | - | Override the type default for blocking line of sight. |
| `robos:difficultTerrain` | `0..*` | - | Override the type default for difficult terrain (double movement cost). |
| `robos:cover` | `0..*` | - | Override the cover it gives: none, half or three-quarters. |

## Example node

The checked-in graph has no node of this class that passes the validator, so this is a placeholder built from the shape. It has every required property, with example values. It is not a node from the graph.

{% raw %}
```json
{
  "@id": "urn:robos:testing:crpg-map-object-sample",
  "@type": [
    "robos:CRPGMapObject",
    "schema:Place",
    "oslc:Resource"
  ],
  "dcterms:title": "Sample CRPG Map Object",
  "dcterms:description": "Placeholder node for robos:CRPGMapObject.",
  "robos:package": "testing",
  "robos:namespace": "robos.testing",
  "robos:objectId": "<objectId>",
  "robos:objectType": "<objectType>",
  "robos:shape": "<shape>",
  "robos:position": "<position>",
  "robos:schemaOrgType": "https://schema.org/Place",
  "robos:domainStandard": "https://robos.dev/ns/crpg#MapObject",
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
