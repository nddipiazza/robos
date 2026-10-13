---
title: Pipeline Step
layout: default
parent: "DevOps & Cloud"
grand_parent: Schemas
nav_order: 13
permalink: /schemas/devops/pipeline-step.html
---

# robos:PipelineStep
{: .no_toc }

Validation shape for `robos:PipelineStep` nodes in the `devops` package group.
{: .fs-6 }

## Details

| Detail | Value |
|---|---|
| Class | `robos:PipelineStep` |
| Shape id | `urn:robos:shape:PipelineStepShape` |
| Package | [DevOps & Cloud]({{ '/schemas/devops.html' | relative_url }}) (`devops`) |
| Classification | Infrastructure & delivery |
| Schema.org type | [`schema:Action`](https://schema.org/Action) |

## Properties

Count is the minimum and maximum number of values (`*` means no maximum). The validator enforces both. The type column is documentation only; the validator does not check types.

| Property | Count | Type | Rule or description |
|---|---|---|---|
| `dcterms:title` | `1..*` | `xsd:string` | Pipeline Step must have a title. |
| `robos:stepName` | `1..*` | `xsd:string` | Pipeline Step must specify step name. |
| `robos:job` | `1..*` | `URI (robos:PipelineJob)` | Pipeline Step must link to parent job. |

## Example node

The checked-in graph has no node of this class that passes the validator, so this is a placeholder built from the shape. It has every required property, with example values. It is not a node from the graph.

{% raw %}
```json
{
  "@id": "urn:robos:devops:pipeline-step-sample",
  "@type": [
    "robos:PipelineStep",
    "schema:Action",
    "oslc:Resource"
  ],
  "dcterms:title": "Sample Pipeline Step",
  "dcterms:description": "Placeholder node for robos:PipelineStep.",
  "robos:package": "devops",
  "robos:namespace": "robos.devops",
  "robos:stepName": "run-linter",
  "robos:job": "urn:robos:job:unit-tests",
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
