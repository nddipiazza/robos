---
title: CRPG Ability
layout: default
parent: "cRPG (robos.crpg)"
grand_parent: Schemas
nav_order: 1
permalink: /schemas/crpg/crpg-ability.html
description: "Validation shape for robos:CRPGAbility nodes in the crpg package group."
---

# robos:CRPGAbility
{: .no_toc }

Validation shape for `robos:CRPGAbility` nodes in the `crpg` package group.
{: .fs-6 }

## Details

| | |
|---|---|
| Class | `robos:CRPGAbility` |
| Shape id | `urn:robos:shape:CRPGAbilityShape` |
| Package | [cRPG (robos.crpg)]({{ '/schemas/crpg.html' | relative_url }}) (`crpg`) |
| Schema.org type | [`schema:Action`](https://schema.org/Action) |
| Domain standard | [robos.dev](https://robos.dev/ns/crpg#Ability) |

## Properties

Count is the minimum and maximum number of values (`*` means no maximum). The validator enforces both. The type column is documentation only; the validator does not check types.

| Property | Count | Type | Rule or description |
|---|---|---|---|
| `dcterms:title` | `1..*` | `xsd:string` | cRPG Ability must have a title. |
| `robos:actionType` | `1..*` | - | cRPG Ability must declare an actionType (action, bonus_action, reaction, passive, free_action). |
| `robos:recharge` | `1..*` | - | cRPG Ability must declare a recharge rate (short_rest, long_rest, at_will, special). |

## Example node

The checked-in graph has no node of this class that passes the validator, so this is a placeholder built from the shape. It has every required property, with example values. It is not a node from the graph.

{% raw %}
```json
{
  "@id": "urn:robos:crpg:crpg-ability-sample",
  "@type": [
    "robos:CRPGAbility",
    "schema:Action",
    "oslc:Resource"
  ],
  "dcterms:title": "Sample CRPG Ability",
  "dcterms:description": "Placeholder node for robos:CRPGAbility.",
  "robos:package": "crpg",
  "robos:namespace": "robos.crpg",
  "robos:actionType": "<actionType>",
  "robos:recharge": "<recharge>",
  "robos:schemaOrgType": "https://schema.org/Action",
  "robos:domainStandard": "https://robos.dev/ns/crpg#Ability",
  "robos:refersFrom": "https://schema.org/Action"
}
```
{% endraw %}

## Validate the example

Save the example as `node.json` in the repository root, then run:

```bash
node -e "const { SHACLValidator } = require('./packages/robos-graph/lib/shacl-validator'); console.log(new SHACLValidator().validate([require('./node.json')]).conforms)"
```

The command prints `true` when the node meets every rule for its types.
