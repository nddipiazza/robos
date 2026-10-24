---
title: CRPG Map Transition
layout: default
parent: "cRPG (robos.crpg)"
grand_parent: Schemas
nav_order: 6
permalink: /schemas/crpg/crpg-map-transition.html
description: "Validation shape for robos:CRPGMapTransition nodes in the crpg package group."
---

# robos:CRPGMapTransition
{: .no_toc }

Validation shape for `robos:CRPGMapTransition` nodes in the `crpg` package group.
{: .fs-6 }

## Details

| | |
|---|---|
| Class | `robos:CRPGMapTransition` |
| Shape id | `urn:robos:shape:CRPGMapTransitionShape` |
| Package | [cRPG (robos.crpg)]({{ '/schemas/crpg.html' | relative_url }}) (`crpg`) |
| Schema.org type | [`schema:Place`](https://schema.org/Place) |
| Domain standard | [robos.dev](https://robos.dev/ns/crpg#MapTransition) |

## Properties

Count is the minimum and maximum number of values (`*` means no maximum). The validator enforces both. The type column is documentation only; the validator does not check types.

| Property | Count | Type | Rule or description |
|---|---|---|---|
| `robos:targetMap` | `1..*` | - | Map transition must declare a target destination map. |
| `robos:targetSpawn` | `1..*` | - | Map transition must declare destination spawn coordinates [x, y]. |

## Example node

The checked-in graph has no node of this class that passes the validator, so this is a placeholder built from the shape. It has every required property, with example values. It is not a node from the graph.

{% raw %}
```json
{
  "@id": "urn:robos:crpg:crpg-map-transition-sample",
  "@type": [
    "robos:CRPGMapTransition",
    "schema:Place",
    "oslc:Resource"
  ],
  "dcterms:title": "Sample CRPG Map Transition",
  "dcterms:description": "Placeholder node for robos:CRPGMapTransition.",
  "robos:package": "crpg",
  "robos:namespace": "robos.crpg",
  "robos:targetMap": "<targetMap>",
  "robos:targetSpawn": "<targetSpawn>",
  "robos:schemaOrgType": "https://schema.org/Place",
  "robos:domainStandard": "https://robos.dev/ns/crpg#MapTransition",
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
