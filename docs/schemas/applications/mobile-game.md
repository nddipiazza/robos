---
title: Mobile Game
layout: default
parent: Applications
grand_parent: Schemas
nav_order: 7
permalink: /schemas/applications/mobile-game.html
---

# robos:MobileGame
{: .no_toc }

Validation shape for `robos:MobileGame` nodes in the `applications` package group.
{: .fs-6 }

## Details

| Detail | Value |
|---|---|
| Class | `robos:MobileGame` |
| Shape id | `urn:robos:shape:MobileGameShape` |
| Package | [Applications]({{ '/schemas/applications.html' | relative_url }}) (`applications`) |
| Classification | Applications & entry points |
| Schema.org type | [`schema:VideoGame`](https://schema.org/VideoGame) |

## Properties

Count is the minimum and maximum number of values (`*` means no maximum). The validator enforces both. The type column is documentation only; the validator does not check types.

| Property | Count | Type | Rule or description |
|---|---|---|---|
| `dcterms:title` | `1..*` | `xsd:string` | Mobile Game must have a title. |
| `robos:repository` | `1..*` | `xsd:string` | Mobile Game must define a repository. |
| `robos:technology` | `1..*` | `xsd:string` | Mobile Game must specify technology stack. |
| `robos:gameEngine` | `1..*` | `xsd:string` | Mobile Game must specify game engine (Unity, Unreal Engine, Godot). |
| `robos:platform` | `1..*` | `xsd:string` | Mobile Game must specify mobile platform(s) (iOS, Android). |

## Example node

The checked-in graph has no node of this class that passes the validator, so this is a placeholder built from the shape. It has every required property, with example values. It is not a node from the graph.

{% raw %}
```json
{
  "@id": "urn:robos:applications:mobile-game-sample",
  "@type": [
    "robos:MobileGame",
    "schema:VideoGame",
    "oslc:Resource"
  ],
  "dcterms:title": "Sample Mobile Game",
  "dcterms:description": "Placeholder node for robos:MobileGame.",
  "robos:package": "applications",
  "robos:namespace": "robos.apps",
  "robos:repository": "github.com/acme/sample-repo",
  "robos:technology": "Node.js / TypeScript",
  "robos:gameEngine": "Unreal Engine 5",
  "robos:platform": "iOS / Android",
  "robos:schemaOrgType": "https://schema.org/VideoGame",
  "robos:domainStandard": "https://schema.org/VideoGame",
  "robos:refersFrom": "https://schema.org/VideoGame"
}
```
{% endraw %}

## Validate the example

Save the example as `node.json` in the repository root, then run:

```bash
node -e "const { SHACLValidator } = require('./packages/robos-graph/lib/shacl-validator'); console.log(new SHACLValidator().validate([require('./node.json')]).conforms)"
```

The command prints `true` when the node meets every rule for its types.
