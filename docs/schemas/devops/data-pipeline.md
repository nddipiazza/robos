---
title: Data Pipeline
layout: default
parent: "DevOps & Cloud (robos.devops)"
grand_parent: Schemas
nav_order: 1
permalink: /schemas/devops/data-pipeline.html
description: "Validation shape for robos:DataPipeline nodes in the devops package group."
---

# robos:DataPipeline
{: .no_toc }

Validation shape for `robos:DataPipeline` nodes in the `devops` package group.
{: .fs-6 }

## Details

| | |
|---|---|
| Class | `robos:DataPipeline` |
| Shape id | `urn:robos:shape:DataPipelineShape` |
| Package | [DevOps & Cloud (robos.devops)]({{ '/schemas/devops.html' | relative_url }}) (`devops`) |
| Classification | Services & processing |
| Schema.org type | [`schema:DataFeed`](https://schema.org/DataFeed) |

## Properties

Count is the minimum and maximum number of values (`*` means no maximum). The validator enforces both. The type column is documentation only; the validator does not check types.

| Property | Count | Type | Rule or description |
|---|---|---|---|
| `dcterms:title` | `1..*` | `xsd:string` | Data Pipeline must have a title. |
| `robos:repository` | `1..*` | `xsd:string` | Data Pipeline must define a repository. |
| `robos:technology` | `1..*` | `xsd:string` | Data Pipeline must specify technology stack. |
| `robos:pipelineEngine` | `1..*` | `xsd:string` | Data Pipeline must declare execution engine (Kafka Streams, Spark, Celery). |

## Example node

The checked-in graph has no node of this class that passes the validator, so this is a placeholder built from the shape. It has every required property, with example values. It is not a node from the graph.

{% raw %}
```json
{
  "@id": "urn:robos:devops:data-pipeline-sample",
  "@type": [
    "robos:DataPipeline",
    "schema:DataFeed",
    "oslc:Resource"
  ],
  "dcterms:title": "Sample Data Pipeline",
  "dcterms:description": "Placeholder node for robos:DataPipeline.",
  "robos:package": "devops",
  "robos:namespace": "robos.devops",
  "robos:repository": "github.com/acme/sample-repo",
  "robos:technology": "Node.js / TypeScript",
  "robos:pipelineEngine": "Kafka Streams",
  "robos:schemaOrgType": "https://schema.org/DataFeed",
  "robos:domainStandard": "https://schema.org/DataFeed",
  "robos:refersFrom": "https://schema.org/DataFeed"
}
```
{% endraw %}

## Validate the example

Save the example as `node.json` in the repository root, then run:

```bash
node -e "const { SHACLValidator } = require('./packages/robos-graph/lib/shacl-validator'); console.log(new SHACLValidator().validate([require('./node.json')]).conforms)"
```

The command prints `true` when the node meets every rule for its types.
