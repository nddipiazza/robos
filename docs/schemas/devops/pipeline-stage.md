---
title: Pipeline Stage
layout: default
parent: "DevOps & Cloud (robos.devops)"
grand_parent: Schemas
nav_order: 11
permalink: /schemas/devops/pipeline-stage.html
---

# robos:PipelineStage
{: .no_toc }

Validation shape for `robos:PipelineStage` nodes in the `devops` package group.
{: .fs-6 }

## Details

| | |
|---|---|
| Class | `robos:PipelineStage` |
| Shape id | `urn:robos:shape:PipelineStageShape` |
| Package | [DevOps & Cloud (robos.devops)]({{ '/schemas/devops.html' | relative_url }}) (`devops`) |
| Classification | Infrastructure & delivery |
| Schema.org type | [`schema:Action`](https://schema.org/Action) |

## Properties

Count is the minimum and maximum number of values (`*` means no maximum). The validator enforces both. The type column is documentation only; the validator does not check types.

| Property | Count | Type | Rule or description |
|---|---|---|---|
| `dcterms:title` | `1..*` | `xsd:string` | Pipeline Stage must have a title. |
| `robos:stageName` | `1..*` | `xsd:string` | Pipeline Stage must specify stage name. |
| `robos:pipeline` | `1..*` | `URI (robos:CICDPipeline)` | Pipeline Stage must link to parent CI/CD pipeline. |

## Example node

The checked-in graph has no node of this class that passes the validator, so this is a placeholder built from the shape. It has every required property, with example values. It is not a node from the graph.

{% raw %}
```json
{
  "@id": "urn:robos:devops:pipeline-stage-sample",
  "@type": [
    "robos:PipelineStage",
    "schema:Action",
    "oslc:Resource"
  ],
  "dcterms:title": "Sample Pipeline Stage",
  "dcterms:description": "Placeholder node for robos:PipelineStage.",
  "robos:package": "devops",
  "robos:namespace": "robos.devops",
  "robos:stageName": "build",
  "robos:pipeline": "urn:robos:pipeline:checkout-service-ci",
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
