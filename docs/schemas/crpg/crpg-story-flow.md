---
title: CRPG Story Flow
layout: default
parent: "Games: cRPG"
grand_parent: Schemas
nav_order: 2
permalink: /schemas/crpg/crpg-story-flow.html
---

# robos:CRPGStoryFlow
{: .no_toc }

Validation shape for `robos:CRPGStoryFlow` nodes in the `crpg` package group.
{: .fs-6 }

## Details

| Detail | Value |
|---|---|
| Class | `robos:CRPGStoryFlow` |
| Shape id | `urn:robos:shape:CRPGStoryFlowShape` |
| Package | [Games: cRPG]({{ '/schemas/crpg.html' | relative_url }}) (`crpg`) |
| Schema.org type | [`schema:CreativeWork`](https://schema.org/CreativeWork) |

## Properties

Count is the minimum and maximum number of values (`*` means no maximum). The validator enforces both. The type column is documentation only; the validator does not check types.

| Property | Count | Type | Rule or description |
|---|---|---|---|
| `robos:rootNodeId` | `1..*` | - | Story flow must declare a root entry node ID. |
| `robos:storyNodes` | `1..*` | - | Story flow must declare story nodes. |

## Example node

The checked-in graph has no node of this class that passes the validator, so this is a placeholder built from the shape. It has every required property, with example values. It is not a node from the graph.

{% raw %}
```json
{
  "@id": "urn:robos:crpg:crpg-story-flow-sample",
  "@type": [
    "robos:CRPGStoryFlow",
    "schema:CreativeWork",
    "oslc:Resource"
  ],
  "dcterms:title": "Sample CRPG Story Flow",
  "dcterms:description": "Placeholder node for robos:CRPGStoryFlow.",
  "robos:package": "crpg",
  "robos:namespace": "robos.crpg",
  "robos:rootNodeId": "<rootNodeId>",
  "robos:storyNodes": "<storyNodes>",
  "robos:schemaOrgType": "https://schema.org/CreativeWork",
  "robos:domainStandard": "https://schema.org/CreativeWork",
  "robos:refersFrom": "https://schema.org/CreativeWork"
}
```
{% endraw %}

## Validate the example

Save the example as `node.json` in the repository root, then run:

```bash
node -e "const { SHACLValidator } = require('./packages/robos-graph/lib/shacl-validator'); console.log(new SHACLValidator().validate([require('./node.json')]).conforms)"
```

The command prints `true` when the node meets every rule for its types.
