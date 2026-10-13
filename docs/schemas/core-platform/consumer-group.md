---
title: Consumer Group
layout: default
parent: Core Platform
grand_parent: Schemas
nav_order: 16
permalink: /schemas/core-platform/consumer-group.html
---

# robos:ConsumerGroup
{: .no_toc }

Validation shape for `robos:ConsumerGroup` nodes in the `core-platform` package group.
{: .fs-6 }

## Details

| Detail | Value |
|---|---|
| Class | `robos:ConsumerGroup` |
| Shape id | `urn:robos:shape:ConsumerGroupShape` |
| Package | [Core Platform]({{ '/schemas/core-platform.html' | relative_url }}) (`core-platform`) |
| Classification | Data stores & messaging |
| Schema.org type | [`schema:Audience`](https://schema.org/Audience) |
| Domain standard | [Apache Kafka](https://kafka.apache.org/documentation/#intro_concepts_and_terms) |

## Properties

Count is the minimum and maximum number of values (`*` means no maximum). The validator enforces both. The type column is documentation only; the validator does not check types.

| Property | Count | Type | Rule or description |
|---|---|---|---|
| `dcterms:title` | `1..*` | `xsd:string` | Consumer Group must have a title. |
| `robos:groupId` | `1..*` | `xsd:string` | Consumer Group must declare consumer group ID. |
| `robos:topic` | `1..*` | `xsd:string` | Consumer Group must link to subscribed topic. |

## Example node

The checked-in graph has no node of this class that passes the validator, so this is a placeholder built from the shape. It has every required property, with example values. It is not a node from the graph.

{% raw %}
```json
{
  "@id": "urn:robos:core-platform:consumer-group-sample",
  "@type": [
    "robos:ConsumerGroup",
    "schema:Audience",
    "oslc:Resource"
  ],
  "dcterms:title": "Sample Consumer Group",
  "dcterms:description": "Placeholder node for robos:ConsumerGroup.",
  "robos:package": "core-platform",
  "robos:namespace": "robos.platform",
  "robos:groupId": "sample-consumer-group",
  "robos:topic": "Distributed Architecture",
  "robos:schemaOrgType": "https://schema.org/Audience",
  "robos:domainStandard": "https://kafka.apache.org/documentation/#intro_concepts_and_terms",
  "robos:refersFrom": "https://schema.org/Audience"
}
```
{% endraw %}

## Validate the example

Save the example as `node.json` in the repository root, then run:

```bash
node -e "const { SHACLValidator } = require('./packages/robos-graph/lib/shacl-validator'); console.log(new SHACLValidator().validate([require('./node.json')]).conforms)"
```

The command prints `true` when the node meets every rule for its types.
