---
title: Message Topic
layout: default
parent: "Core Platform (robos.platform)"
grand_parent: Schemas
nav_order: 15
permalink: /schemas/core-platform/message-topic.html
description: "Validation shape for robos:MessageTopic nodes in the core-platform package group."
---

# robos:MessageTopic
{: .no_toc }

Validation shape for `robos:MessageTopic` nodes in the `core-platform` package group.
{: .fs-6 }

## Details

| | |
|---|---|
| Class | `robos:MessageTopic` |
| Also matches | `robos:MessageQueue`, `robos:EventTopic` |
| Shape id | `urn:robos:shape:MessageTopicShape` |
| Package | [Core Platform (robos.platform)]({{ '/schemas/core-platform.html' | relative_url }}) (`core-platform`) |
| Classification | Data stores & messaging |
| Schema.org type | [`schema:BroadcastChannel`](https://schema.org/BroadcastChannel) |
| Domain standard | [Apache Kafka](https://kafka.apache.org/documentation/#intro_concepts_and_terms) |

## Properties

Count is the minimum and maximum number of values (`*` means no maximum). The validator enforces both. The type column is documentation only; the validator does not check types.

| Property | Count | Type | Rule or description |
|---|---|---|---|
| `dcterms:title` | `1..*` | `xsd:string` | Message Topic must have a title. |
| `robos:topicName` | `1..*` | `xsd:string` | Message Topic must specify topic name. |
| `robos:broker` | `1..*` | `URI (robos:MessageBroker)` | Message Topic must link to parent message broker. |

## Example node

The checked-in graph has no node of this class that passes the validator, so this is a placeholder built from the shape. It has every required property, with example values. It is not a node from the graph.

{% raw %}
```json
{
  "@id": "urn:robos:core-platform:message-topic-sample",
  "@type": [
    "robos:MessageTopic",
    "robos:MessageQueue",
    "robos:EventTopic",
    "schema:BroadcastChannel",
    "oslc:Resource"
  ],
  "dcterms:title": "Sample Message Topic",
  "dcterms:description": "Placeholder node for robos:MessageTopic.",
  "robos:package": "core-platform",
  "robos:namespace": "robos.platform",
  "robos:topicName": "sample-events-v1",
  "robos:broker": "urn:robos:broker:acme-kafka",
  "robos:schemaOrgType": "https://schema.org/BroadcastChannel",
  "robos:domainStandard": "https://kafka.apache.org/documentation/#intro_concepts_and_terms",
  "robos:refersFrom": "https://schema.org/BroadcastChannel"
}
```
{% endraw %}

## Validate the example

Save the example as `node.json` in the repository root, then run:

```bash
node -e "const { SHACLValidator } = require('./packages/robos-graph/lib/shacl-validator'); console.log(new SHACLValidator().validate([require('./node.json')]).conforms)"
```

The command prints `true` when the node meets every rule for its types.
