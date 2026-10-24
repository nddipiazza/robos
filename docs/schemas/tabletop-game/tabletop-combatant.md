---
title: Tabletop Combatant
layout: default
parent: "Tabletop Game (robos.tabletop)"
grand_parent: Schemas
nav_order: 11
permalink: /schemas/tabletop-game/tabletop-combatant.html
description: "Validation shape for robos:TabletopCombatant nodes in the tabletop-game package group."
---

# robos:TabletopCombatant
{: .no_toc }

Validation shape for `robos:TabletopCombatant` nodes in the `tabletop-game` package group.
{: .fs-6 }

## Details

| | |
|---|---|
| Class | `robos:TabletopCombatant` |
| Shape id | `urn:robos:shape:TabletopCombatantShape` |
| Package | [Tabletop Game (robos.tabletop)]({{ '/schemas/tabletop-game.html' | relative_url }}) (`tabletop-game`) |
| Classification | Testing & behavior |
| Schema.org type | [`schema:Person`](https://schema.org/Person) |
| Domain standard | [robos.dev](https://robos.dev/ns/tabletop#Combatant) |

## Properties

Count is the minimum and maximum number of values (`*` means no maximum). The validator enforces both. The type column is documentation only; the validator does not check types.

| Property | Count | Type | Rule or description |
|---|---|---|---|
| `robos:actorId` | `1..*` | - | Tabletop Combatant must have an actor id. |

## Example node

The checked-in graph has no node of this class that passes the validator, so this is a placeholder built from the shape. It has every required property, with example values. It is not a node from the graph.

{% raw %}
```json
{
  "@id": "urn:robos:tabletop-game:tabletop-combatant-sample",
  "@type": [
    "robos:TabletopCombatant",
    "schema:Person",
    "oslc:Resource"
  ],
  "dcterms:title": "Sample Tabletop Combatant",
  "dcterms:description": "Placeholder node for robos:TabletopCombatant.",
  "robos:package": "tabletop-game",
  "robos:namespace": "robos.tabletop",
  "robos:actorId": "<actorId>",
  "robos:schemaOrgType": "https://schema.org/Person",
  "robos:domainStandard": "https://robos.dev/ns/tabletop#Combatant",
  "robos:refersFrom": "https://schema.org/Person"
}
```
{% endraw %}

## Validate the example

Save the example as `node.json` in the repository root, then run:

```bash
node -e "const { SHACLValidator } = require('./packages/robos-graph/lib/shacl-validator'); console.log(new SHACLValidator().validate([require('./node.json')]).conforms)"
```

The command prints `true` when the node meets every rule for its types.
