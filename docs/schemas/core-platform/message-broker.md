---
title: Message Broker
layout: default
parent: "Core Platform (robos.platform)"
grand_parent: Schemas
nav_order: 6
permalink: /schemas/core-platform/message-broker.html
---

# robos:MessageBroker
{: .no_toc }

Validation shape for `robos:MessageBroker` nodes in the `core-platform` package group.
{: .fs-6 }

## Details

| | |
|---|---|
| Class | `robos:MessageBroker` |
| Also matches | `robos:EventBus` |
| Shape id | `urn:robos:shape:MessageBrokerShape` |
| Package | [Core Platform (robos.platform)]({{ '/schemas/core-platform.html' | relative_url }}) (`core-platform`) |
| Classification | Data stores & messaging |
| Schema.org type | [`schema:BroadcastService`](https://schema.org/BroadcastService) |
| Domain standard | [Apache Kafka](https://kafka.apache.org/) |

## Properties

Count is the minimum and maximum number of values (`*` means no maximum). The validator enforces both. The type column is documentation only; the validator does not check types.

| Property | Count | Type | Rule or description |
|---|---|---|---|
| `dcterms:title` | `1..*` | `xsd:string` | Message Broker must have a title or display name. |
| `robos:brokerType` | `1..*` | - | Message Broker must declare broker type (kafka, rabbitmq, sqs, nats, pulsar). |
| `robos:endpoint` | `1..*` | - | Message Broker must specify bootstrap endpoint URI. |

## Example node

This node comes from `.robos/kgraphs/core-platform/package.jsonld` in the RobOS repository. That graph holds sample data for a fictional company, so treat the values as illustrations.

{% raw %}
```json
{
  "@id": "urn:robos:broker:kafka-stream",
  "@type": [
    "oslc_am:Resource",
    "robos:MessageBroker",
    "robos:EventBus"
  ],
  "dcterms:title": "KAFKA Event Stream",
  "dcterms:description": "Imported event bus at kafka.internal:9092",
  "robos:brokerType": "kafka",
  "robos:endpoint": "kafka.internal:9092",
  "robos:topics": [
    "events.incoming",
    "events.processed"
  ],
  "robos:package": "core-platform",
  "robos:namespace": "robos.platform",
  "robos:schemaOrgType": "https://schema.org/BroadcastService",
  "robos:domainStandard": "https://kafka.apache.org/"
}
```
{% endraw %}

## Validate the example

Save the example as `node.json` in the repository root, then run:

```bash
node -e "const { SHACLValidator } = require('./packages/robos-graph/lib/shacl-validator'); console.log(new SHACLValidator().validate([require('./node.json')]).conforms)"
```

The command prints `true` when the node meets every rule for its types.
