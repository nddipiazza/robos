---
title: Feature
layout: default
parent: "Services & Contracts"
grand_parent: Schemas
nav_order: 6
permalink: /schemas/services/feature.html
---

# robos:Feature
{: .no_toc }

Validation shape for `robos:Feature` nodes in the `services` package group.
{: .fs-6 }

## Details

| Detail | Value |
|---|---|
| Class | `robos:Feature` |
| Also matches | `robos:ProductFeature` |
| Shape id | `urn:robos:shape:FeatureShape` |
| Package | [Services & Contracts]({{ '/schemas/services.html' | relative_url }}) (`services`) |
| Classification | Projects & work items |
| Schema.org type | [`schema:DigitalDocument`](https://schema.org/DigitalDocument) |
| Domain standard | [OSLC RM](http://open-services.net/ns/rm#Requirement) |

## Properties

Count is the minimum and maximum number of values (`*` means no maximum). The validator enforces both. The type column is documentation only; the validator does not check types.

| Property | Count | Type | Rule or description |
|---|---|---|---|
| `dcterms:title` | `1..*` | `xsd:string` | Feature must have a title. |

## Example node

The checked-in graph has no node of this class that passes the validator, so this is a placeholder built from the shape. It has every required property, with example values. It is not a node from the graph.

{% raw %}
```json
{
  "@id": "urn:robos:services:feature-sample",
  "@type": [
    "robos:Feature",
    "robos:ProductFeature",
    "schema:DigitalDocument",
    "oslc:Resource"
  ],
  "dcterms:title": "Sample Feature",
  "dcterms:description": "Placeholder node for robos:Feature.",
  "robos:package": "services",
  "robos:namespace": "robos.services",
  "robos:schemaOrgType": "https://schema.org/DigitalDocument",
  "robos:domainStandard": "http://open-services.net/ns/rm#Requirement",
  "robos:refersFrom": "http://open-services.net/ns/rm#Requirement"
}
```
{% endraw %}

## Validate the example

Save the example as `node.json` in the repository root, then run:

```bash
node -e "const { SHACLValidator } = require('./packages/robos-graph/lib/shacl-validator'); console.log(new SHACLValidator().validate([require('./node.json')]).conforms)"
```

The command prints `true` when the node meets every rule for its types.
