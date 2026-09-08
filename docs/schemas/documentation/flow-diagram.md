---
title: Flow Diagram
layout: default
parent: Documentation & Diagrams (robos.docs)
grand_parent: KGraph Schemas
nav_order: 1
permalink: /schemas/documentation/flow-diagram.html
---

# Schema: `robos:FlowDiagram`
{: .no_toc }

Formal W3C SHACL constraint shape and OSLC JSON-LD specification for `robos:FlowDiagram` in the `documentation` package store.
{: .fs-6 .fw-300 }

## Table of contents
{: .no_toc .text-delta }

1. TOC
{:toc}

---

## Specification Metadata

- **RDF / OWL Class**: `robos:FlowDiagram`
- **Aliases / Target Classes**: `robos:FlowDiagram`
- **SHACL Shape ID**: `urn:robos:shape:FlowDiagramShape`
- **Governing Package**: [Documentation & Diagrams (robos.docs)]({{ '/schemas/documentation.html' | relative_url }}) (`documentation`)
- **Namespace**: `robos.docs`
- **Schema.org Classification**: [https://schema.org/ImageObject](https://schema.org/ImageObject)
- **Domain De Facto Standard**: [https://schema.org/ImageObject](https://schema.org/ImageObject)
- **Upstream Schema Basis (Refers From)**: [https://schema.org/ImageObject](https://schema.org/ImageObject)

---

## Upstream Schema Basis (Refers From) & Global Standards Provenance

This RobOS schema is modeled after and directly aligns with two levels of global standards:
- **Universal Schema.org Class**: [https://schema.org/ImageObject](https://schema.org/ImageObject) (100% interoperability with search engines, web indexers, and general AI reasoning)
- **Specialized Domain Standard**: [https://schema.org/ImageObject](https://schema.org/ImageObject) (de facto standard for domain-specific ALM, BDD, or infrastructure operations)
- **Canonical Reference**: [https://schema.org/ImageObject](https://schema.org/ImageObject)
- **Agent Guidelines**: When autonomous agents generate, expand, or validate instances of `robos:FlowDiagram`, they MUST adhere to and base their output on this referred schema object and universal Schema.org parent class, extending it with RobOS SDLC properties.

---

## Entity Relationship & Schema Context

<div style="margin: 1.5rem 0; padding: 1.25rem; background: #161b22; border: 1px solid #30363d; border-radius: 8px;">
  <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.75rem; flex-wrap: wrap; gap: 0.5rem;">
    <span style="font-size: 1.15rem; font-weight: 700; color: #38bdf8;">Flow Diagram</span>
    <span style="font-family: monospace; background: #121927; color: #00e5ff; border: 1px solid rgba(0, 229, 255, 0.4); padding: 0.2rem 0.6rem; border-radius: 6px; font-size: 0.85rem;">robos:FlowDiagram</span>
  </div>
  <p style="margin-bottom: 0.75rem; font-size: 0.92rem; color: #c9d1d9;">Governed by W3C SHACL shape <code>urn:robos:shape:FlowDiagramShape</code> within the <strong>Documentation & Diagrams (robos.docs)</strong> (<code>robos.docs</code>) package store.</p>
  <div style="display: flex; flex-wrap: wrap; gap: 0.5rem; margin-top: 0.5rem;">
    <span style="background: #0d1117; border: 1px solid #21262d; padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.8rem; color: #8b949e;"><code>dcterms:title</code></span>
    <span style="background: #0d1117; border: 1px solid #21262d; padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.8rem; color: #8b949e;"><code>dcterms:description</code></span>
    <span style="background: #0d1117; border: 1px solid #21262d; padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.8rem; color: #8b949e;"><code>robos:mermaidText</code></span>
    <span style="background: #0d1117; border: 1px solid #21262d; padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.8rem; color: #8b949e;"><code>robos:imagePath</code></span>
    <span style="background: #0d1117; border: 1px solid #21262d; padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.8rem; color: #8b949e;"><code>robos:tooltip</code></span>
  </div>
</div>

---

## Property Constraints & SHACL Rules

| Property Path | Name | Multiplicity | Data Type | Constraint Rule / Validation Message |
|---|---|---|---|---|
| **`dcterms:title`** | Title / Display Name | `1..*` | `xsd:string` | Flow Diagram must have a title. |
| **`dcterms:description`** | Description | `1..*` | `xsd:string` | Flow Diagram must have a description. |
| **`robos:mermaidText`** | Mermaid Graph Definition | `1..*` | `xsd:string` | Flow Diagram must contain raw Mermaid graph syntax (robos:mermaidText). |
| **`robos:imagePath`** | AI-Rendered Diagram Image | `1..*` | `xsd:string` | Flow Diagram must specify relative path to AI-rendered image (robos:imagePath). |
| **`robos:tooltip`** | Hover Tooltip Summary | `1..*` | `xsd:string` | Flow Diagram must declare hover tooltip text (robos:tooltip). |

---

## Canonical OSLC JSON-LD Example

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

---

## Programmatic SHACL Validation

```javascript
const { SHACLValidator } = require('/usr/local/share/robos/robos-graph/lib/shacl-validator');
const { OSLCGraphParser, OSLC_CONTEXT } = require('/usr/local/share/robos/robos-graph/lib/oslc-parser');

const validator = new SHACLValidator();
const result = validator.validateGraph(new OSLCGraphParser({
  "@context": OSLC_CONTEXT,
  "robos:nodes": [
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
  ],
}));

console.log("Conforms:", result.conforms); // Expected: true
```