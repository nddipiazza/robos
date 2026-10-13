---
title: CRPG Campaign
layout: default
parent: "cRPG (robos.crpg)"
grand_parent: Schemas
nav_order: 5
permalink: /schemas/crpg/crpg-campaign.html
---

# robos:CRPGCampaign
{: .no_toc }

Validation shape for `robos:CRPGCampaign` nodes in the `crpg` package group.
{: .fs-6 }

## Details

| | |
|---|---|
| Class | `robos:CRPGCampaign` |
| Shape id | `urn:robos:shape:CRPGCampaignShape` |
| Package | [cRPG (robos.crpg)]({{ '/schemas/crpg.html' | relative_url }}) (`crpg`) |
| Schema.org type | [`schema:CreativeWork`](https://schema.org/CreativeWork) |

## Properties

Count is the minimum and maximum number of values (`*` means no maximum). The validator enforces both. The type column is documentation only; the validator does not check types.

| Property | Count | Type | Rule or description |
|---|---|---|---|
| `dcterms:title` | `1..*` | `xsd:string` | CRPG Campaign must have a title. |
| `robos:startingMap` | `1..*` | - | CRPG Campaign must specify starting battle map (robos:startingMap). |
| `robos:maps` | `1..*` | - | CRPG Campaign must declare included battle maps (robos:maps). |

## Example node

The checked-in graph has no node of this class that passes the validator, so this is a placeholder built from the shape. It has every required property, with example values. It is not a node from the graph.

{% raw %}
```json
{
  "@id": "urn:robos:crpg:crpg-campaign-sample",
  "@type": [
    "robos:CRPGCampaign",
    "schema:CreativeWork",
    "oslc:Resource"
  ],
  "dcterms:title": "Sample CRPG Campaign",
  "dcterms:description": "Placeholder node for robos:CRPGCampaign.",
  "robos:package": "crpg",
  "robos:namespace": "robos.crpg",
  "robos:startingMap": "<startingMap>",
  "robos:maps": "<maps>",
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
