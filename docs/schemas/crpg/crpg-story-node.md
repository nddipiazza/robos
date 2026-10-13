---
title: CRPG Story Node
layout: default
parent: "cRPG (robos.crpg)"
grand_parent: Schemas
nav_order: 3
permalink: /schemas/crpg/crpg-story-node.html
---

# robos:CRPGStoryNode
{: .no_toc }

Validation shape for `robos:CRPGStoryNode` nodes in the `crpg` package group.
{: .fs-6 }

## Details

| | |
|---|---|
| Class | `robos:CRPGStoryNode` |
| Shape id | `urn:robos:shape:CRPGStoryNodeShape` |
| Package | [cRPG (robos.crpg)]({{ '/schemas/crpg.html' | relative_url }}) (`crpg`) |
| Classification | Testing & behavior |
| Domain standard | [OSLC CM](http://open-services.net/ns/cm#ChangeRequest) |

## Properties

Count is the minimum and maximum number of values (`*` means no maximum). The validator enforces both. The type column is documentation only; the validator does not check types.

| Property | Count | Type | Rule or description |
|---|---|---|---|
| `dcterms:title` | `1..*` | `xsd:string` | Story node must have a title. |
| `robos:nodeType` | `1..*` | - | Story node must specify node type (game_start, act_chapter, quest_stage, decision_branch, combat_trial, end_game_state). |
| `robos:act` | `1..*` | - | Story node must specify narrative act or chapter. |

## Example node

The checked-in graph has no node of this class that passes the validator, so this is a placeholder built from the shape. It has every required property, with example values. It is not a node from the graph.

{% raw %}
```json
{
  "@id": "urn:robos:crpg:crpg-story-node-sample",
  "@type": [
    "robos:CRPGStoryNode",
    "schema:http://open-services.net/ns/cm#ChangeRequest",
    "oslc:Resource"
  ],
  "dcterms:title": "Sample CRPG Story Node",
  "dcterms:description": "Placeholder node for robos:CRPGStoryNode.",
  "robos:package": "crpg",
  "robos:namespace": "robos.crpg",
  "robos:nodeType": "<nodeType>",
  "robos:act": "<act>",
  "robos:schemaOrgType": "http://open-services.net/ns/cm#ChangeRequest",
  "robos:domainStandard": "http://open-services.net/ns/cm#ChangeRequest",
  "robos:refersFrom": "http://open-services.net/ns/cm#ChangeRequest"
}
```
{% endraw %}

## Validate the example

Save the example as `node.json` in the repository root, then run:

```bash
node -e "const { SHACLValidator } = require('./packages/robos-graph/lib/shacl-validator'); console.log(new SHACLValidator().validate([require('./node.json')]).conforms)"
```

The command prints `true` when the node meets every rule for its types.
