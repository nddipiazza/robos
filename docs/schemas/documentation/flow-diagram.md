---
title: Flow Diagram
layout: default
parent: "Documentation & Diagrams"
grand_parent: Schemas
nav_order: 1
permalink: /schemas/documentation/flow-diagram.html
---

# robos:FlowDiagram
{: .no_toc }

Validation shape for `robos:FlowDiagram` nodes in the `documentation` package group.
{: .fs-6 }

## Details

| Detail | Value |
|---|---|
| Class | `robos:FlowDiagram` |
| Shape id | `urn:robos:shape:FlowDiagramShape` |
| Package | [Documentation & Diagrams]({{ '/schemas/documentation.html' | relative_url }}) (`documentation`) |
| Classification | Documentation & decisions |
| Schema.org type | [`schema:ImageObject`](https://schema.org/ImageObject) |

## Properties

Count is the minimum and maximum number of values (`*` means no maximum). The validator enforces both. The type column is documentation only; the validator does not check types.

| Property | Count | Type | Rule or description |
|---|---|---|---|
| `dcterms:title` | `1..*` | `xsd:string` | Flow Diagram must have a title. |
| `dcterms:description` | `1..*` | `xsd:string` | Flow Diagram must have a description. |
| `robos:mermaidText` | `1..*` | `xsd:string` | Flow Diagram must contain raw Mermaid graph syntax (robos:mermaidText). |
| `robos:imagePath` | `1..*` | `xsd:string` | Flow Diagram must specify relative path to AI-rendered image (robos:imagePath). |
| `robos:tooltip` | `1..*` | `xsd:string` | Flow Diagram must declare hover tooltip text (robos:tooltip). |

## Example node

This node comes from `.robos/kgraphs/documentation/package.jsonld` in the RobOS repository. That graph holds sample data for a fictional company, so treat the values as illustrations.

{% raw %}
```json
{
  "@id": "urn:robos:diagram:order-lifecycle-flow",
  "@type": [
    "oslc_am:Resource",
    "robos:FlowDiagram",
    "schema:ImageObject"
  ],
  "dcterms:title": "Order Lifecycle & Event Processing Flow",
  "dcterms:description": "End-to-end workflow tracing customer order ingestion from Webhook to Kafka events, payment capture, and inventory deduction.",
  "robos:tooltip": "Visual sequence of order validation, distributed transaction, and event routing",
  "robos:mermaidText": "sequenceDiagram\n    participant Client\n    participant Gateway\n    participant OrderService\n    participant Kafka\n    Client->>Gateway: POST /orders\n    Gateway->>OrderService: Validate & Route\n    OrderService->>Kafka: Emit OrderCreated\n",
  "robos:imagePath": "assets/images/architecture/order-lifecycle-flow.jpg",
  "robos:diagramType": "sequence",
  "robos:aspectRatio": "16:9",
  "robos:targetComponent": "urn:robos:service:forms-api",
  "robos:tags": [
    "Architecture",
    "Ordering",
    "EventDriven"
  ],
  "robos:package": "documentation",
  "robos:namespace": "robos.docs",
  "robos:schemaOrgType": "https://schema.org/ImageObject",
  "robos:domainStandard": "https://schema.org/ImageObject"
}
```
{% endraw %}

## Validate the example

Save the example as `node.json` in the repository root, then run:

```bash
node -e "const { SHACLValidator } = require('./packages/robos-graph/lib/shacl-validator'); console.log(new SHACLValidator().validate([require('./node.json')]).conforms)"
```

The command prints `true` when the node meets every rule for its types.
