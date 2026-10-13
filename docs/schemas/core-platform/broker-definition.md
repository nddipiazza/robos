---
title: Broker Definition
layout: default
parent: Core Platform
grand_parent: Schemas
nav_order: 22
permalink: /schemas/core-platform/broker-definition.html
---

# robos:BrokerDefinition
{: .no_toc }

Validation shape for `robos:BrokerDefinition` nodes in the `core-platform` package group.
{: .fs-6 }

## Details

| Detail | Value |
|---|---|
| Class | `robos:BrokerDefinition` |
| Shape id | `robos:BrokerDefinitionShape` |
| Package | [Core Platform]({{ '/schemas/core-platform.html' | relative_url }}) (`core-platform`) |
| Classification | Data stores & messaging |
| Schema.org type | [`schema:Service`](https://schema.org/Service) |

## Properties

Count is the minimum and maximum number of values (`*` means no maximum). The validator enforces both. The type column is documentation only; the validator does not check types.

| Property | Count | Type | Rule or description |
|---|---|---|---|
| `dcterms:title` | `1..*` | `xsd:string` | Broker definition needs a title. |
| `robos:brokerType` | `1..*` | - | Broker definition needs its technology. |
| `robos:evidence` | `1..*` | - | Broker definition needs source evidence. |

## Example node

The checked-in graph has no node of this class that passes the validator, so this is a placeholder built from the shape. It has every required property, with example values. It is not a node from the graph.

{% raw %}
```json
{
  "@id": "urn:robos:core-platform:broker-definition-sample",
  "@type": [
    "robos:BrokerDefinition",
    "schema:Service",
    "oslc:Resource"
  ],
  "dcterms:title": "Sample Broker Definition",
  "dcterms:description": "Placeholder node for robos:BrokerDefinition.",
  "robos:package": "core-platform",
  "robos:namespace": "robos.platform",
  "robos:brokerType": "<brokerType>",
  "robos:evidence": "<evidence>",
  "robos:schemaOrgType": "https://schema.org/Service",
  "robos:domainStandard": "https://schema.org/Service",
  "robos:refersFrom": "https://schema.org/Service"
}
```
{% endraw %}

## Validate the example

Save the example as `node.json` in the repository root, then run:

```bash
node -e "const { SHACLValidator } = require('./packages/robos-graph/lib/shacl-validator'); console.log(new SHACLValidator().validate([require('./node.json')]).conforms)"
```

The command prints `true` when the node meets every rule for its types.
