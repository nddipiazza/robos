---
title: Pipeline Job
layout: default
parent: "DevOps & Cloud"
grand_parent: Schemas
nav_order: 12
permalink: /schemas/devops/pipeline-job.html
---

# robos:PipelineJob
{: .no_toc }

Validation shape for `robos:PipelineJob` nodes in the `devops` package group.
{: .fs-6 }

## Details

| Detail | Value |
|---|---|
| Class | `robos:PipelineJob` |
| Shape id | `urn:robos:shape:PipelineJobShape` |
| Package | [DevOps & Cloud]({{ '/schemas/devops.html' | relative_url }}) (`devops`) |
| Classification | Infrastructure & delivery |
| Schema.org type | [`schema:Action`](https://schema.org/Action) |

## Properties

Count is the minimum and maximum number of values (`*` means no maximum). The validator enforces both. The type column is documentation only; the validator does not check types.

| Property | Count | Type | Rule or description |
|---|---|---|---|
| `dcterms:title` | `1..*` | `xsd:string` | Pipeline Job must have a title. |
| `robos:jobName` | `1..*` | `xsd:string` | Pipeline Job must specify job name. |
| `robos:stage` | `1..*` | `URI (robos:PipelineStage)` | Pipeline Job must link to parent pipeline stage. |

## Example node

The checked-in graph has no node of this class that passes the validator, so this is a placeholder built from the shape. It has every required property, with example values. It is not a node from the graph.

{% raw %}
```json
{
  "@id": "urn:robos:devops:pipeline-job-sample",
  "@type": [
    "robos:PipelineJob",
    "schema:Action",
    "oslc:Resource"
  ],
  "dcterms:title": "Sample Pipeline Job",
  "dcterms:description": "Placeholder node for robos:PipelineJob.",
  "robos:package": "devops",
  "robos:namespace": "robos.devops",
  "robos:jobName": "unit-tests",
  "robos:stage": "urn:robos:stage:build",
  "robos:schemaOrgType": "https://schema.org/Action",
  "robos:domainStandard": "https://schema.org/Action",
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
