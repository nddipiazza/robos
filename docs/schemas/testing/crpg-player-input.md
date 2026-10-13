---
title: CRPG Player Input
layout: default
parent: "Testing, Quality & BDD (robos.testing)"
grand_parent: Schemas
nav_order: 8
permalink: /schemas/testing/crpg-player-input.html
---

# robos:CRPGPlayerInput
{: .no_toc }

Validation shape for `robos:CRPGPlayerInput` nodes in the `testing` package group.
{: .fs-6 }

## Details

| | |
|---|---|
| Class | `robos:CRPGPlayerInput` |
| Shape id | `urn:robos:shape:CRPGPlayerInputShape` |
| Package | [Testing, Quality & BDD (robos.testing)]({{ '/schemas/testing.html' | relative_url }}) (`testing`) |
| Classification | Testing & behavior |
| Schema.org type | [`schema:InteractAction`](https://schema.org/InteractAction) |
| Domain standard | [robos.dev](https://robos.dev/ns/crpg#PlayerInput) |
| Upstream reference | [schema:Action](https://schema.org/Action) |

## Properties

Count is the minimum and maximum number of values (`*` means no maximum). The validator enforces both. The type column is documentation only; the validator does not check types.

| Property | Count | Type | Rule or description |
|---|---|---|---|
| `robos:type` | `1..*` | - | Player input must declare its type: attack, cast, use_item, move, dodge, disengage, search, disarm or wait. |
| `robos:round` | `0..*` | - | Round in which to play this input; omitted means the actor's next turn. |
| `robos:target` | `0..*` | - | Actor id the input targets. |
| `robos:spell` | `0..*` | - | Spell id for cast inputs. |
| `robos:item` | `0..*` | - | Item id for use_item inputs. |
| `robos:point` | `0..*` | - | [x, y] in feet for area spells. |
| `robos:to` | `0..*` | - | [x, y] in feet for move inputs. |

## Example node

The checked-in graph has no node of this class that passes the validator, so this is a placeholder built from the shape. It has every required property, with example values. It is not a node from the graph.

{% raw %}
```json
{
  "@id": "urn:robos:testing:crpg-player-input-sample",
  "@type": [
    "robos:CRPGPlayerInput",
    "schema:InteractAction",
    "oslc:Resource"
  ],
  "dcterms:title": "Sample CRPG Player Input",
  "dcterms:description": "Placeholder node for robos:CRPGPlayerInput.",
  "robos:package": "testing",
  "robos:namespace": "robos.testing",
  "robos:type": "<type>",
  "robos:schemaOrgType": "https://schema.org/InteractAction",
  "robos:domainStandard": "https://robos.dev/ns/crpg#PlayerInput",
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
