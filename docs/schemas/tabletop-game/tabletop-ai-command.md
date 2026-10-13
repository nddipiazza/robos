---
title: Tabletop AI Command
layout: default
parent: "Tabletop Game (robos.tabletop)"
grand_parent: Schemas
nav_order: 12
permalink: /schemas/tabletop-game/tabletop-ai-command.html
---

# robos:TabletopAICommand
{: .no_toc }

Validation shape for `robos:TabletopAICommand` nodes in the `tabletop-game` package group.
{: .fs-6 }

## Details

| | |
|---|---|
| Class | `robos:TabletopAICommand` |
| Shape id | `urn:robos:shape:TabletopAICommandShape` |
| Package | [Tabletop Game (robos.tabletop)]({{ '/schemas/tabletop-game.html' | relative_url }}) (`tabletop-game`) |
| Classification | Testing & behavior |
| Schema.org type | [`schema:InteractAction`](https://schema.org/InteractAction) |
| Domain standard | [robos.dev](https://robos.dev/ns/tabletop#AICommand) |

## Properties

Count is the minimum and maximum number of values (`*` means no maximum). The validator enforces both. The type column is documentation only; the validator does not check types.

| Property | Count | Type | Rule or description |
|---|---|---|---|
| `robos:action` | `1..*` | - | Tabletop AI Command must specify an action. |

## Example node

The checked-in graph has no node of this class that passes the validator, so this is a placeholder built from the shape. It has every required property, with example values. It is not a node from the graph.

{% raw %}
```json
{
  "@id": "urn:robos:tabletop-game:tabletop-ai-command-sample",
  "@type": [
    "robos:TabletopAICommand",
    "schema:InteractAction",
    "oslc:Resource"
  ],
  "dcterms:title": "Sample Tabletop AI Command",
  "dcterms:description": "Placeholder node for robos:TabletopAICommand.",
  "robos:package": "tabletop-game",
  "robos:namespace": "robos.tabletop",
  "robos:action": "<action>",
  "robos:schemaOrgType": "https://schema.org/InteractAction",
  "robos:domainStandard": "https://robos.dev/ns/tabletop#AICommand",
  "robos:refersFrom": "https://schema.org/InteractAction"
}
```
{% endraw %}

## Validate the example

Save the example as `node.json` in the repository root, then run:

```bash
node -e "const { SHACLValidator } = require('./packages/robos-graph/lib/shacl-validator'); console.log(new SHACLValidator().validate([require('./node.json')]).conforms)"
```

The command prints `true` when the node meets every rule for its types.
