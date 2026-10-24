---
title: Learning Lesson
layout: default
parent: "eLearning Curriculums (robos.learning)"
grand_parent: Schemas
nav_order: 4
permalink: /schemas/learning/learning-lesson.html
description: "Validation shape for robos:LearningLesson nodes in the learning package group."
---

# robos:LearningLesson
{: .no_toc }

Validation shape for `robos:LearningLesson` nodes in the `learning` package group.
{: .fs-6 }

## Details

| | |
|---|---|
| Class | `robos:LearningLesson` |
| Shape id | `urn:robos:shape:LearningLessonShape` |
| Package | [eLearning Curriculums (robos.learning)]({{ '/schemas/learning.html' | relative_url }}) (`learning`) |
| Classification | Learning & assessment |
| Schema.org type | [`schema:LearningResource`](https://schema.org/LearningResource) |

## Properties

Count is the minimum and maximum number of values (`*` means no maximum). The validator enforces both. The type column is documentation only; the validator does not check types.

| Property | Count | Type | Rule or description |
|---|---|---|---|
| `dcterms:title` | `1..*` | `xsd:string` | Learning Lesson must have a title. |
| `robos:module` | `1..*` | `URI (robos:LearningModule)` | Learning Lesson must link to parent learning module. |

## Example node

The checked-in graph has no node of this class that passes the validator, so this is a placeholder built from the shape. It has every required property, with example values. It is not a node from the graph.

{% raw %}
```json
{
  "@id": "urn:robos:learning:learning-lesson-sample",
  "@type": [
    "robos:LearningLesson",
    "schema:LearningResource",
    "oslc:Resource"
  ],
  "dcterms:title": "Sample Learning Lesson",
  "dcterms:description": "Placeholder node for robos:LearningLesson.",
  "robos:package": "learning",
  "robos:namespace": "robos.learning",
  "robos:module": "urn:robos:module:sample-module",
  "robos:schemaOrgType": "https://schema.org/LearningResource",
  "robos:domainStandard": "https://schema.org/LearningResource",
  "robos:refersFrom": "https://schema.org/LearningResource"
}
```
{% endraw %}

## Validate the example

Save the example as `node.json` in the repository root, then run:

```bash
node -e "const { SHACLValidator } = require('./packages/robos-graph/lib/shacl-validator'); console.log(new SHACLValidator().validate([require('./node.json')]).conforms)"
```

The command prints `true` when the node meets every rule for its types.
