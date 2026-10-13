---
title: PC Game
layout: default
parent: Applications
grand_parent: Schemas
nav_order: 6
permalink: /schemas/applications/pc-game.html
---

# robos:PCGame
{: .no_toc }

Validation shape for `robos:PCGame` nodes in the `applications` package group.
{: .fs-6 }

## Details

| Detail | Value |
|---|---|
| Class | `robos:PCGame` |
| Shape id | `urn:robos:shape:PCGameShape` |
| Package | [Applications]({{ '/schemas/applications.html' | relative_url }}) (`applications`) |
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

This node comes from `.robos/kgraphs/crpg/package.jsonld` in the RobOS repository. That graph holds sample data for a fictional company, so treat the values as illustrations.

{% raw %}
```json
{
  "@id": "urn:robos:crpg:game:realm-of-heroes",
  "@type": [
    "oslc_am:Resource",
    "robos:CRPGGame",
    "robos:PCGame",
    "schema:VideoGame",
    "robos:Game"
  ],
  "dcterms:title": "Realm of Heroes: A Night Without Memory",
  "robos:repository": "github.com/nddipiazza/realm-of-heroes",
  "robos:technology": "Godot 4 / GDScript",
  "robos:gameEngine": "Godot 4",
  "robos:targetPlatform": "Linux, Windows, macOS",
  "robos:ruleset": "dnd5e",
  "robos:combatModel": "real-time-with-pause",
  "robos:startingZone": "urn:robos:crpg:zone:homestead",
  "robos:assetPackage": "flareteam/flare-game",
  "robos:engineArchitecture": "urn:robos:infinity:engine:gemrb-infinity",
  "robos:maxPartySize": 4,
  "robos:hasELearning": [
    "urn:robos:elearning:course:robos-crpg",
    "urn:robos:elearning:course:crpg-game-builder"
  ],
  "robos:package": "crpg",
  "robos:namespace": "robos.crpg",
  "robos:hasCertificate": [
    "urn:robos:credential:certificate:realm-of-heroes-dungeon-master-robos-mucuwt58",
    "urn:robos:credential:certificate:realm-of-heroes-dungeon-master-robos-mucuxcai",
    "urn:robos:credential:certificate:realm-of-heroes-dungeon-master-robos-mucuxgib",
    "urn:robos:credential:certificate:realm-of-heroes-dungeon-master-robos-mucuzxah",
    "urn:robos:credential:certificate:realm-of-heroes-dungeon-master-robos-mucvgud2",
    "urn:robos:credential:certificate:realm-of-heroes-dungeon-master-robos-mucvo90i",
    "urn:robos:credential:certificate:realm-of-heroes-dungeon-master-robos-mucw058n",
    "urn:robos:credential:certificate:realm-of-heroes-dungeon-master-robos-mucw0qkp",
    "urn:robos:credential:certificate:realm-of-heroes-dungeon-master-robos-mucxg34v",
    "urn:robos:credential:certificate:realm-of-heroes-dungeon-master-robos-mucxmod6",
    "urn:robos:credential:certificate:realm-of-heroes-dungeon-master-robos-muhkm21t",
    "urn:robos:credential:certificate:realm-of-heroes-dungeon-master-robos-muhkmgt4",
    "urn:robos:credential:certificate:realm-of-heroes-dungeon-master-robos-muhkn2tn",
    "urn:robos:credential:certificate:realm-of-heroes-dungeon-master-robos-muhknorg",
    "urn:robos:credential:certificate:realm-of-heroes-dungeon-master-robos-muhkny96",
    "urn:robos:credential:certificate:realm-of-heroes-dungeon-master-robos-muhkurva",
    "urn:robos:credential:certificate:realm-of-heroes-dungeon-master-robos-muhkvjue",
    "urn:robos:credential:certificate:realm-of-heroes-dungeon-master-robos-muhkvs2f",
    "urn:robos:credential:certificate:realm-of-heroes-dungeon-master-robos-muhkxn9z",
    "urn:robos:credential:certificate:realm-of-heroes-dungeon-master-robos-muicj0mi",
    "urn:robos:credential:certificate:realm-of-heroes-dungeon-master-robos-muicp0oa",
    "urn:robos:credential:certificate:realm-of-heroes-dungeon-master-robos-muicpmge",
    "urn:robos:credential:certificate:realm-of-heroes-dungeon-master-robos-muimlank",
    "urn:robos:credential:certificate:realm-of-heroes-dungeon-master-robos-muimmiax"
  ],
  "robos:gameType": "crpg"
}
```
{% endraw %}

## Validate the example

Save the example as `node.json` in the repository root, then run:

```bash
node -e "const { SHACLValidator } = require('./packages/robos-graph/lib/shacl-validator'); console.log(new SHACLValidator().validate([require('./node.json')]).conforms)"
```

The command prints `true` when the node meets every rule for its types.
