---
title: Tabletop AI Directive
layout: default
parent: "Tabletop Game (robos.tabletop)"
grand_parent: Schemas
nav_order: 10
permalink: /schemas/tabletop-game/tabletop-ai-directive.html
description: "Validation shape for robos:TabletopAIDirective nodes in the tabletop-game package group."
---

# robos:TabletopAIDirective
{: .no_toc }

Validation shape for `robos:TabletopAIDirective` nodes in the `tabletop-game` package group.
{: .fs-6 }

## Details

| | |
|---|---|
| Class | `robos:TabletopAIDirective` |
| Shape id | `urn:robos:shape:TabletopAIDirectiveShape` |
| Package | [Tabletop Game (robos.tabletop)]({{ '/schemas/tabletop-game.html' | relative_url }}) (`tabletop-game`) |
| Classification | Testing & behavior |
| Schema.org type | [`schema:ControlAction`](https://schema.org/ControlAction) |
| Domain standard | [robos.dev](https://robos.dev/ns/tabletop#AIDirective) |

## Properties

Count is the minimum and maximum number of values (`*` means no maximum). The validator enforces both. The type column is documentation only; the validator does not check types.

| Property | Count | Type | Rule or description |
|---|---|---|---|
| `robos:controller` | `1..*` | - | Tabletop AI Directive must declare a controller (autonomous_ai, proposal_confirmed, scripted, idle). |

## Example node

This node comes from `.robos/kgraphs/tabletop-game/package.jsonld` in the RobOS repository. That graph holds sample data for a fictional company, so treat the values as illustrations.

{% raw %}
```json
{
  "@id": "urn:robos:tabletop:ai-directive:dwarf-trap-searcher",
  "@type": [
    "oslc_am:Resource",
    "robos:TabletopAIDirective",
    "schema:ControlAction"
  ],
  "dcterms:title": "Dwarf Trap & Treasure Scout Directive",
  "robos:controller": "proposal_confirmed",
  "robos:actor": "dwarf",
  "robos:targetPriority": "nearest",
  "robos:movementTactic": "advance",
  "robos:actionPriority": "search_room",
  "robos:proposalConfirmationRequired": true,
  "robos:package": "tabletop-game",
  "robos:namespace": "robos.tabletop"
}
```
{% endraw %}

## Validate the example

Save the example as `node.json` in the repository root, then run:

```bash
node -e "const { SHACLValidator } = require('./packages/robos-graph/lib/shacl-validator'); console.log(new SHACLValidator().validate([require('./node.json')]).conforms)"
```

The command prints `true` when the node meets every rule for its types.
