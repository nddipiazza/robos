---
title: Protobuf Contract
layout: default
parent: Services & Contracts (robos.services)
grand_parent: KGraph Schemas
nav_order: 4
permalink: /schemas/services/protobuf-contract.html
---

# Schema: `robos:ProtobufContract`
{: .no_toc }

Formal W3C SHACL constraint shape and OSLC JSON-LD specification for `robos:ProtobufContract` in the `services` package store.
{: .fs-6 .fw-300 }

## Table of contents
{: .no_toc .text-delta }

1. TOC
{:toc}

---

## Specification Metadata

- **RDF / OWL Class**: `robos:ProtobufContract`
- **Aliases / Target Classes**: `robos:ProtobufContract`, `robos:GRPCContract`
- **SHACL Shape ID**: `urn:robos:shape:ProtobufContractShape`
- **Governing Package**: [Services & Contracts (robos.services)]({{ '/schemas/services.html' | relative_url }}) (`services`)
- **Namespace**: `robos.services`
- **Upstream Schema Basis (Refers From)**: [http://open-services.net/ns/am#Resource](http://open-services.net/ns/am#Resource)

---

## Upstream Schema Basis (Refers From)

This RobOS schema is modeled after and directly expands upon the upstream canonical standard:
- **Canonical Reference**: [http://open-services.net/ns/am#Resource](http://open-services.net/ns/am#Resource)
- **Provenance & Alignment**: When autonomous agents generate, expand, or validate instances of `robos:ProtobufContract`, they MUST adhere to and base their output on this referred schema object, extending it with RobOS SDLC properties.

---

## Entity Relationship & Schema Context

<div style="margin: 1.5rem 0; padding: 1.25rem; background: #161b22; border: 1px solid #30363d; border-radius: 8px;">
  <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.75rem; flex-wrap: wrap; gap: 0.5rem;">
    <span style="font-size: 1.15rem; font-weight: 700; color: #38bdf8;">Protobuf Contract</span>
    <span style="font-family: monospace; background: #121927; color: #00e5ff; border: 1px solid rgba(0, 229, 255, 0.4); padding: 0.2rem 0.6rem; border-radius: 6px; font-size: 0.85rem;">robos:ProtobufContract</span>
  </div>
  <p style="margin-bottom: 0.75rem; font-size: 0.92rem; color: #c9d1d9;">Governed by W3C SHACL shape <code>urn:robos:shape:ProtobufContractShape</code> within the <strong>Services & Contracts (robos.services)</strong> (<code>robos.services</code>) package store.</p>
  <div style="display: flex; flex-wrap: wrap; gap: 0.5rem; margin-top: 0.5rem;">
    <span style="background: #0d1117; border: 1px solid #21262d; padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.8rem; color: #8b949e;"><code>dcterms:title</code></span>
    <span style="background: #0d1117; border: 1px solid #21262d; padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.8rem; color: #8b949e;"><code>robos:specFile</code></span>
    <span style="background: #0d1117; border: 1px solid #21262d; padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.8rem; color: #8b949e;"><code>robos:packageName</code></span>
    <span style="background: #0d1117; border: 1px solid #21262d; padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.8rem; color: #8b949e;"><code>robos:rpcMethods</code></span>
  </div>
</div>

---

## Property Constraints & SHACL Rules

| Property Path | Name | Multiplicity | Data Type | Constraint Rule / Validation Message |
|---|---|---|---|---|
| **`dcterms:title`** | Title / Display Name | `1..*` | `xsd:string` | Protobuf Contract must have a title. |
| **`robos:specFile`** | Specification File | `1..*` | `xsd:string` | Protobuf Contract must specify .proto file path. |
| **`robos:packageName`** | packageName | `1..*` | `xsd:string` | Protobuf Contract must specify protobuf package name. |
| **`robos:rpcMethods`** | rpcMethods | `1..*` | `xsd:string` | Protobuf Contract must declare RPC methods. |

---

## Canonical OSLC JSON-LD Example

```json
{
  "@id": "urn:robos:contract:orders-grpc",
  "@type": [
    "robos:Contract",
    "robos:ProtobufContract",
    "robos:GRPCContract"
  ],
  "dcterms:title": "Acme Orders gRPC Protobuf Contract",
  "dcterms:description": "High-performance binary gRPC interface definition for transactional order lifecycle.",
  "robos:protocol": "grpc-protobuf",
  "robos:specFile": "proto/orders/v1/orders.proto",
  "robos:packageName": "acme.orders.v1",
  "robos:rpcMethods": [
    "CreateOrder",
    "GetOrderStatus",
    "CancelOrder",
    "StreamOrderEvents"
  ],
  "robos:package": "services",
  "robos:namespace": "robos.services"
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
        "@id": "urn:robos:contract:orders-grpc",
        "@type": [
            "robos:Contract",
            "robos:ProtobufContract",
            "robos:GRPCContract"
        ],
        "dcterms:title": "Acme Orders gRPC Protobuf Contract",
        "dcterms:description": "High-performance binary gRPC interface definition for transactional order lifecycle.",
        "robos:protocol": "grpc-protobuf",
        "robos:specFile": "proto/orders/v1/orders.proto",
        "robos:packageName": "acme.orders.v1",
        "robos:rpcMethods": [
            "CreateOrder",
            "GetOrderStatus",
            "CancelOrder",
            "StreamOrderEvents"
        ],
        "robos:package": "services",
        "robos:namespace": "robos.services"
    }
  ],
}));

console.log("Conforms:", result.conforms); // Expected: true
```