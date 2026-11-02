---
title: PC Game
layout: default
parent: "Applications (robos.apps)"
grand_parent: Schemas
nav_order: 6
permalink: /schemas/applications/pc-game.html
description: "Validation shape for robos:PCGame nodes in the applications package group."
---

# robos:PCGame
{: .no_toc }

Validation shape for `robos:PCGame` nodes in the `applications` package group.
{: .fs-6 }

## Details

| | |
|---|---|
| Class | `robos:PCGame` |
| Shape id | `urn:robos:shape:PCGameShape` |
| Package | [Applications (robos.apps)]({{ '/schemas/applications.html' | relative_url }}) (`applications`) |
| Classification | Applications & entry points |
| Schema.org type | [`schema:VideoGame`](https://schema.org/VideoGame) |

## Properties

Count is the minimum and maximum number of values (`*` means no maximum). The validator enforces both. The type column is documentation only; the validator does not check types.

| Property | Count | Type | Rule or description |
|---|---|---|---|
| `dcterms:title` | `1..*` | `xsd:string` | PC Game must have a title. |
| `robos:repository` | `1..*` | `xsd:string` | PC Game must define a repository. |
| `robos:technology` | `1..*` | `xsd:string` | PC Game must specify technology stack. |
| `robos:gameEngine` | `1..*` | `xsd:string` | PC Game must specify game engine (Unreal Engine, Unity, Godot, Bevy). |
| `robos:targetPlatform` | `1..*` | `xsd:string` | PC Game must specify target PC platform(s) (Windows, Linux, macOS). |

## Example node

This node comes from `.robos/kgraphs/jrpg/package.jsonld` in the RobOS repository. That graph holds sample data for a fictional company, so treat the values as illustrations.

{% raw %}
```json
{
  "@id": "urn:robos:jrpg:game:quest-warrior-dragon",
  "@type": [
    "oslc_am:Resource",
    "robos:PCGame",
    "robos:Game",
    "schema:VideoGame"
  ],
  "dcterms:description": "Classic 2D tile-based turn-based JRPG powered by the RobOS Dual-State Knowledge Graph, Godot 4, and 100% procedural copyright-free pixel art and chiptune audio.",
  "dcterms:title": "Quest: Warrior Dragon (RobOS 2D JRPG Engine)",
  "robos:combatModel": "turn-based-menu",
  "robos:gameEngine": "Godot 4",
  "robos:gameType": "jrpg",
  "robos:namespace": "robos.jrpg",
  "robos:package": "jrpg",
  "robos:repository": "github.com/nddipiazza/quest-warrior-dragon",
  "robos:ruleset": "quest-warrior-dragon",
  "robos:targetPlatform": "Linux, Windows, macOS",
  "robos:technology": "Godot 4 / GDScript"
}
```
{% endraw %}

## Validate the example

Save the example as `node.json` in the repository root, then run:

```bash
node -e "const { SHACLValidator } = require('./packages/robos-graph/lib/shacl-validator'); console.log(new SHACLValidator().validate([require('./node.json')]).conforms)"
```

The command prints `true` when the node meets every rule for its types.
