---
title: Learning Module
layout: default
parent: "eLearning Curriculums (robos.learning)"
grand_parent: Schemas
nav_order: 3
permalink: /schemas/learning/learning-module.html
description: "Validation shape for robos:LearningModule nodes in the learning package group."
---

# robos:LearningModule
{: .no_toc }

Validation shape for `robos:LearningModule` nodes in the `learning` package group.
{: .fs-6 }

## Details

| | |
|---|---|
| Class | `robos:LearningModule` |
| Shape id | `urn:robos:shape:LearningModuleShape` |
| Package | [eLearning Curriculums (robos.learning)]({{ '/schemas/learning.html' | relative_url }}) (`learning`) |
| Classification | Learning & assessment |
| Schema.org type | [`schema:CourseInstance`](https://schema.org/CourseInstance) |

## Properties

Count is the minimum and maximum number of values (`*` means no maximum). The validator enforces both. The type column is documentation only; the validator does not check types.

| Property | Count | Type | Rule or description |
|---|---|---|---|
| `dcterms:title` | `1..*` | `xsd:string` | Learning Module must have a title. |
| `robos:course` | `1..*` | `URI (robos:ELearning)` | Learning Module must link to parent eLearning course. |

## Example node

The checked-in graph has no node of this class that passes the validator, so this is a placeholder built from the shape. It has every required property, with example values. It is not a node from the graph.

{% raw %}
```json
{
  "@id": "urn:robos:learning:learning-module-sample",
  "@type": [
    "robos:LearningModule",
    "schema:CourseInstance",
    "oslc:Resource"
  ],
  "dcterms:title": "Sample Learning Module",
  "dcterms:description": "Placeholder node for robos:LearningModule.",
  "robos:package": "learning",
  "robos:namespace": "robos.learning",
  "robos:course": "urn:robos:elearning:microservices-contracts",
  "robos:schemaOrgType": "https://schema.org/CourseInstance",
  "robos:domainStandard": "https://schema.org/CourseInstance",
  "robos:refersFrom": "https://schema.org/CourseInstance"
}
```
{% endraw %}

## Validate the example

Save the example as `node.json` in the repository root, then run:

```bash
node -e "const { SHACLValidator } = require('./packages/robos-graph/lib/shacl-validator'); console.log(new SHACLValidator().validate([require('./node.json')]).conforms)"
```

The command prints `true` when the node meets every rule for its types.
