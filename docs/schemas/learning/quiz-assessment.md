---
title: Quiz Assessment
layout: default
parent: eLearning
grand_parent: Schemas
nav_order: 6
permalink: /schemas/learning/quiz-assessment.html
---

# robos:QuizAssessment
{: .no_toc }

Validation shape for `robos:QuizAssessment` nodes in the `learning` package group.
{: .fs-6 }

## Details

| Detail | Value |
|---|---|
| Class | `robos:QuizAssessment` |
| Shape id | `urn:robos:shape:QuizAssessmentShape` |
| Package | [eLearning]({{ '/schemas/learning.html' | relative_url }}) (`learning`) |
| Classification | Learning & assessment |
| Schema.org type | [`schema:Quiz`](https://schema.org/Quiz) |

## Properties

Count is the minimum and maximum number of values (`*` means no maximum). The validator enforces both. The type column is documentation only; the validator does not check types.

| Property | Count | Type | Rule or description |
|---|---|---|---|
| `dcterms:title` | `1..*` | `xsd:string` | Quiz Assessment must have a title. |
| `robos:module` | `1..*` | `URI (robos:LearningModule)` | Quiz Assessment must link to parent module. |

## Example node

The checked-in graph has no node of this class that passes the validator, so this is a placeholder built from the shape. It has every required property, with example values. It is not a node from the graph.

{% raw %}
```json
{
  "@id": "urn:robos:learning:quiz-assessment-sample",
  "@type": [
    "robos:QuizAssessment",
    "schema:Quiz",
    "oslc:Resource"
  ],
  "dcterms:title": "Sample Quiz Assessment",
  "dcterms:description": "Placeholder node for robos:QuizAssessment.",
  "robos:package": "learning",
  "robos:namespace": "robos.learning",
  "robos:module": "urn:robos:module:sample-module",
  "robos:schemaOrgType": "https://schema.org/Quiz",
  "robos:domainStandard": "https://schema.org/Quiz",
  "robos:refersFrom": "https://schema.org/Quiz"
}
```
{% endraw %}

## Validate the example

Save the example as `node.json` in the repository root, then run:

```bash
node -e "const { SHACLValidator } = require('./packages/robos-graph/lib/shacl-validator'); console.log(new SHACLValidator().validate([require('./node.json')]).conforms)"
```

The command prints `true` when the node meets every rule for its types.
