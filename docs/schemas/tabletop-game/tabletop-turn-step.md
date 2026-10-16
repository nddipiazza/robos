---
title: Tabletop Turn Step
layout: default
parent: "Tabletop Game (robos.tabletop)"
grand_parent: Schemas
nav_order: 8
permalink: /schemas/tabletop-game/tabletop-turn-step.html
---

# robos:TabletopTurnStep
{: .no_toc }

Validation shape for `robos:TabletopTurnStep` nodes in the `tabletop-game` package group.
{: .fs-6 }

## Details

| | |
|---|---|
| Class | `robos:TabletopTurnStep` |
| Shape id | `urn:robos:shape:TabletopTurnStepShape` |
| Package | [Tabletop Game (robos.tabletop)]({{ '/schemas/tabletop-game.html' | relative_url }}) (`tabletop-game`) |
| Classification | Testing & behavior |
| Schema.org type | [`schema:Action`](https://schema.org/Action) |
| Domain standard | [robos.dev](https://robos.dev/ns/tabletop#TurnStep) |

## Properties

Count is the minimum and maximum number of values (`*` means no maximum). The validator enforces both. The type column is documentation only; the validator does not check types.

| Property | Count | Type | Rule or description |
|---|---|---|---|
| `dcterms:title` | `1..*` | `xsd:string` | Tabletop turn step must have a title. |
| `robos:stepType` | `1..*` | - | Tabletop turn step must declare a step type. |

## Example node

The checked-in graph has no node of this class that passes the validator, so this is a placeholder built from the shape. It has every required property, with example values. It is not a node from the graph.

{% raw %}
```json
{
  "@id": "urn:robos:tabletop-game:tabletop-turn-step-sample",
  "@type": [
    "robos:TabletopTurnStep",
    "schema:Action",
    "oslc:Resource"
  ],
  "dcterms:title": "Sample Tabletop Turn Step",
  "dcterms:description": "Placeholder node for robos:TabletopTurnStep.",
  "robos:package": "tabletop-game",
  "robos:namespace": "robos.tabletop",
  "robos:stepType": "<stepType>",
  "robos:schemaOrgType": "https://schema.org/Action",
  "robos:domainStandard": "https://robos.dev/ns/tabletop#TurnStep",
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
