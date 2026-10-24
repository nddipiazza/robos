---
title: Curriculum Definition
layout: default
parent: "Core Platform (robos.platform)"
grand_parent: Schemas
nav_order: 20
permalink: /schemas/core-platform/curriculum-definition.html
description: "Validation shape for robos:CurriculumDefinition nodes in the core-platform package group."
---

# robos:CurriculumDefinition
{: .no_toc }

Validation shape for `robos:CurriculumDefinition` nodes in the `core-platform` package group.
{: .fs-6 }

## Details

| | |
|---|---|
| Class | `robos:CurriculumDefinition` |
| Shape id | `robos:CurriculumDefinitionShape` |
| Package | [Core Platform (robos.platform)]({{ '/schemas/core-platform.html' | relative_url }}) (`core-platform`) |
| Classification | Learning & assessment |
| Schema.org type | [`schema:Course`](https://schema.org/Course) |

## Properties

Count is the minimum and maximum number of values (`*` means no maximum). The validator enforces both. The type column is documentation only; the validator does not check types.

| Property | Count | Type | Rule or description |
|---|---|---|---|
| `dcterms:title` | `1..*` | `xsd:string` | Curriculum needs a title. |
| `robos:sourcePath` | `1..*` | - | Curriculum needs its source document. |
| `robos:evidence` | `1..*` | - | Curriculum needs source evidence. |

## Example node

The checked-in graph has no node of this class that passes the validator, so this is a placeholder built from the shape. It has every required property, with example values. It is not a node from the graph.

{% raw %}
```json
{
  "@id": "urn:robos:core-platform:curriculum-definition-sample",
  "@type": [
    "robos:CurriculumDefinition",
    "schema:Course",
    "oslc:Resource"
  ],
  "dcterms:title": "Sample Curriculum Definition",
  "dcterms:description": "Placeholder node for robos:CurriculumDefinition.",
  "robos:package": "core-platform",
  "robos:namespace": "robos.platform",
  "robos:sourcePath": "<sourcePath>",
  "robos:evidence": "<evidence>",
  "robos:schemaOrgType": "https://schema.org/Course",
  "robos:domainStandard": "https://schema.org/Course",
  "robos:refersFrom": "https://schema.org/Course"
}
```
{% endraw %}

## Validate the example

Save the example as `node.json` in the repository root, then run:

```bash
node -e "const { SHACLValidator } = require('./packages/robos-graph/lib/shacl-validator'); console.log(new SHACLValidator().validate([require('./node.json')]).conforms)"
```

The command prints `true` when the node meets every rule for its types.
