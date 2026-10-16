---
title: Infinity AI Directive
layout: default
parent: "Testing, Quality & BDD (robos.testing)"
grand_parent: Schemas
nav_order: 7
permalink: /schemas/testing/infinity-ai-directive.html
---

# robos:InfinityAIDirective
{: .no_toc }

Validation shape for `robos:InfinityAIDirective` nodes in the `testing` package group.
{: .fs-6 }

## Details

| | |
|---|---|
| Class | `robos:InfinityAIDirective` |
| Shape id | `urn:robos:shape:InfinityAIDirectiveShape` |
| Package | [Testing, Quality & BDD (robos.testing)]({{ '/schemas/testing.html' | relative_url }}) (`testing`) |
| Classification | Testing & behavior |
| Schema.org type | [`schema:ControlAction`](https://schema.org/ControlAction) |
| Domain standard | [robos.dev](https://robos.dev/ns/crpg#InfinityAIDirective) |
| Upstream reference | [schema:Action](https://schema.org/Action) |

## Properties

Count is the minimum and maximum number of values (`*` means no maximum). The validator enforces both. The type column is documentation only; the validator does not check types.

| Property | Count | Type | Rule or description |
|---|---|---|---|
| `robos:controller` | `1..*` | - | Directive must declare its controller: infinity_ai, scripted or idle. |
| `robos:actor` | `0..*` | - | The combatant this directive steers; omit and set robos:side to steer a whole side. |
| `robos:side` | `0..*` | - | party, enemy or all: steer every combatant on that side. |
| `robos:targetPriority` | `0..*` | - | nearest, lowest_hp, highest_hp, weakest_ac or spellcaster. |
| `robos:focusTarget` | `0..*` | - | Actor id to attack whenever it is a valid target. |
| `robos:preferSpells` | `0..*` | - | Spell ids to try first, in order. |
| `robos:forbidSpells` | `0..*` | - | Spell ids the Infinity AI must never cast. |
| `robos:healThreshold` | `0..*` | - | Heal an ally below this fraction of max HP (default 0.5). |
| `robos:movement` | `0..*` | - | advance, hold or kite. |
| `robos:scriptedInputs` | `0..*` | - | Ordered robos:CRPGPlayerInput commands played before the AI takes over. |

## Example node

The checked-in graph has no node of this class that passes the validator, so this is a placeholder built from the shape. It has every required property, with example values. It is not a node from the graph.

{% raw %}
```json
{
  "@id": "urn:robos:testing:infinity-ai-directive-sample",
  "@type": [
    "robos:InfinityAIDirective",
    "schema:ControlAction",
    "oslc:Resource"
  ],
  "dcterms:title": "Sample Infinity AI Directive",
  "dcterms:description": "Placeholder node for robos:InfinityAIDirective.",
  "robos:package": "testing",
  "robos:namespace": "robos.testing",
  "robos:controller": "<controller>",
  "robos:schemaOrgType": "https://schema.org/ControlAction",
  "robos:domainStandard": "https://robos.dev/ns/crpg#InfinityAIDirective",
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
