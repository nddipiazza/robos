---
title: Hands On Lab
layout: default
parent: "eLearning Curriculums (robos.learning)"
grand_parent: Schemas
nav_order: 5
permalink: /schemas/learning/hands-on-lab.html
description: "Validation shape for robos:HandsOnLab nodes in the learning package group."
---

# robos:HandsOnLab
{: .no_toc }

Validation shape for `robos:HandsOnLab` nodes in the `learning` package group.
{: .fs-6 }

## Details

| | |
|---|---|
| Class | `robos:HandsOnLab` |
| Shape id | `urn:robos:shape:HandsOnLabShape` |
| Package | [eLearning Curriculums (robos.learning)]({{ '/schemas/learning.html' | relative_url }}) (`learning`) |
| Classification | Learning & assessment |
| Schema.org type | [`schema:ExercisePlan`](https://schema.org/ExercisePlan) |

## Properties

Count is the minimum and maximum number of values (`*` means no maximum). The validator enforces both. The type column is documentation only; the validator does not check types.

| Property | Count | Type | Rule or description |
|---|---|---|---|
| `dcterms:title` | `1..*` | `xsd:string` | Hands-on Lab must have a title. |
| `robos:labFile` | `1..*` | `xsd:string` | Hands-on Lab must specify lab guide file path. |
| `robos:module` | `1..*` | `URI (robos:LearningModule)` | Hands-on Lab must link to parent learning module. |

## Example node

The checked-in graph has no node of this class that passes the validator, so this is a placeholder built from the shape. It has every required property, with example values. It is not a node from the graph.

{% raw %}
```json
{
  "@id": "urn:robos:learning:hands-on-lab-sample",
  "@type": [
    "robos:HandsOnLab",
    "schema:ExercisePlan",
    "oslc:Resource"
  ],
  "dcterms:title": "Sample Hands On Lab",
  "dcterms:description": "Placeholder node for robos:HandsOnLab.",
  "robos:package": "learning",
  "robos:namespace": "robos.learning",
  "robos:labFile": "labs/sample-lab.md",
  "robos:module": "urn:robos:module:sample-module",
  "robos:schemaOrgType": "https://schema.org/ExercisePlan",
  "robos:domainStandard": "https://schema.org/ExercisePlan",
  "robos:refersFrom": "https://schema.org/ExercisePlan"
}
```
{% endraw %}

## Validate the example

Save the example as `node.json` in the repository root, then run:

```bash
node -e "const { SHACLValidator } = require('./packages/robos-graph/lib/shacl-validator'); console.log(new SHACLValidator().validate([require('./node.json')]).conforms)"
```

The command prints `true` when the node meets every rule for its types.
