---
title: eLearning Course
layout: default
parent: eLearning
grand_parent: Schemas
nav_order: 1
permalink: /schemas/learning/elearning.html
---

# robos:ELearning
{: .no_toc }

Validation shape for `robos:ELearning` nodes in the `learning` package group.
{: .fs-6 }

## Details

| Detail | Value |
|---|---|
| Class | `robos:ELearning` |
| Shape id | `urn:robos:shape:ELearningShape` |
| Package | [eLearning]({{ '/schemas/learning.html' | relative_url }}) (`learning`) |
| Classification | Learning & assessment |
| Schema.org type | [`schema:Course`](https://schema.org/Course) |

## Properties

Count is the minimum and maximum number of values (`*` means no maximum). The validator enforces both. The type column is documentation only; the validator does not check types.

| Property | Count | Type | Rule or description |
|---|---|---|---|
| `dcterms:title` | `1..*` | `xsd:string` | eLearning course must have a title. |
| `robos:topic` | `1..*` | `xsd:string` | eLearning course must specify a topic domain. |
| `robos:modules` | `1..*` | `Array<robos:LearningModule>` | eLearning course must have at least one learning module. |
| `robos:gitopsFile` | `1..*` | `xsd:string` | eLearning course must declare its GitOps file location (.robos/elearning.yaml). |

## Example node

This node comes from `.robos/kgraphs/learning/package.jsonld` in the RobOS repository. That graph holds sample data for a fictional company, so treat the values as illustrations.

{% raw %}
```json
{
  "@id": "urn:robos:elearning:course:sdlc-fundamentals",
  "@type": [
    "oslc_am:Resource",
    "robos:ELearningCourse",
    "robos:ELearning",
    "schema:Course"
  ],
  "dcterms:title": "RobOS Dual-State SDLC Fundamentals",
  "dcterms:description": "Mastering the knowledge graph, branch diffing, and automated E2E verification in RobOS.",
  "robos:topic": "SDLC Fundamentals",
  "robos:level": "Intermediate",
  "robos:modulesCount": 4,
  "robos:gitopsFile": ".robos/elearning.yaml",
  "robos:modules": [
    {
      "title": "Module 1: Dual-State Architecture",
      "labFile": "labs/01-dual-state.md"
    }
  ],
  "robos:package": "learning",
  "robos:namespace": "robos.learning",
  "robos:schemaOrgType": "https://schema.org/Course",
  "robos:domainStandard": "https://schema.org/Course"
}
```
{% endraw %}

## Validate the example

Save the example as `node.json` in the repository root, then run:

```bash
node -e "const { SHACLValidator } = require('./packages/robos-graph/lib/shacl-validator'); console.log(new SHACLValidator().validate([require('./node.json')]).conforms)"
```

The command prints `true` when the node meets every rule for its types.
