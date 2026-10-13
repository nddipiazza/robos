---
title: CRPG Combatant
layout: default
parent: "Testing & BDD"
grand_parent: Schemas
nav_order: 6
permalink: /schemas/testing/crpg-combatant.html
---

# robos:CRPGCombatant
{: .no_toc }

Validation shape for `robos:CRPGCombatant` nodes in the `testing` package group.
{: .fs-6 }

## Details

| Detail | Value |
|---|---|
| Class | `robos:CRPGCombatant` |
| Shape id | `urn:robos:shape:CRPGCombatantShape` |
| Package | [Testing & BDD]({{ '/schemas/testing.html' | relative_url }}) (`testing`) |
| Classification | Testing & behavior |
| Schema.org type | [`schema:Person`](https://schema.org/Person) |
| Domain standard | [robos.dev](https://robos.dev/ns/crpg#Combatant) |

## Properties

Count is the minimum and maximum number of values (`*` means no maximum). The validator enforces both. The type column is documentation only; the validator does not check types.

| Property | Count | Type | Rule or description |
|---|---|---|---|
| `robos:actorId` | `1..*` | - | Combatant must have an actor id that directives, inputs and assertions refer to. |
| `robos:characterClass` | `0..*` | - | Party combatants name a robos:CRPGClass (fighter, wizard, ...). |
| `robos:monster` | `0..*` | - | Enemy combatants name a robos:CRPGMonster, or give a custom stat block with robos:attacks. |
| `robos:position` | `0..*` | - | Starting position in feet as [x, y]. |

## Example node

The checked-in graph has no node of this class that passes the validator, so this is a placeholder built from the shape. It has every required property, with example values. It is not a node from the graph.

{% raw %}
```json
{
  "@id": "urn:robos:testing:crpg-combatant-sample",
  "@type": [
    "robos:CRPGCombatant",
    "schema:Person",
    "oslc:Resource"
  ],
  "dcterms:title": "Sample CRPG Combatant",
  "dcterms:description": "Placeholder node for robos:CRPGCombatant.",
  "robos:package": "testing",
  "robos:namespace": "robos.testing",
  "robos:actorId": "<actorId>",
  "robos:schemaOrgType": "https://schema.org/Person",
  "robos:domainStandard": "https://robos.dev/ns/crpg#Combatant",
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
