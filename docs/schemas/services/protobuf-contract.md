---
title: Protobuf Contract
layout: default
parent: "Services & Contracts"
grand_parent: Schemas
nav_order: 4
permalink: /schemas/services/protobuf-contract.html
---

# robos:ProtobufContract
{: .no_toc }

Validation shape for `robos:ProtobufContract` nodes in the `services` package group.
{: .fs-6 }

## Details

| Detail | Value |
|---|---|
| Class | `robos:ProtobufContract` |
| Also matches | `robos:GRPCContract` |
| Shape id | `urn:robos:shape:ProtobufContractShape` |
| Package | [Services & Contracts]({{ '/schemas/services.html' | relative_url }}) (`services`) |
| Classification | Contracts & data models |
| Schema.org type | [`schema:DigitalDocument`](https://schema.org/DigitalDocument) |
| Domain standard | [protobuf.dev](https://protobuf.dev/) |
| Upstream reference | [OSLC AM](http://open-services.net/ns/am#Resource) |

## Properties

Count is the minimum and maximum number of values (`*` means no maximum). The validator enforces both. The type column is documentation only; the validator does not check types.

| Property | Count | Type | Rule or description |
|---|---|---|---|
| `dcterms:title` | `1..*` | `xsd:string` | Protobuf Contract must have a title. |
| `robos:specFile` | `1..*` | `xsd:string` | Protobuf Contract must specify .proto file path. |
| `robos:packageName` | `1..*` | - | Protobuf Contract must specify protobuf package name. |
| `robos:rpcMethods` | `1..*` | - | Protobuf Contract must declare RPC methods. |

## Example node

This node comes from `.robos/kgraphs/services/package.jsonld` in the RobOS repository. That graph holds sample data for a fictional company, so treat the values as illustrations.

{% raw %}
```json
{
  "@id": "urn:robos:contract:orders-grpc",
  "@type": [
    "robos:Contract",
    "robos:ProtobufContract",
    "robos:GRPCContract",
    "schema:DigitalDocument"
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
  "robos:namespace": "robos.services",
  "robos:schemaOrgType": "https://schema.org/DigitalDocument",
  "robos:domainStandard": "http://open-services.net/ns/am#Resource",
  "robos:rpcDetails": {
    "CreateOrder": {
      "description": "Submit cart for payment processing and fulfillment",
      "request": {
        "customerId": "cust_88190",
        "items": [
          {
            "sku": "SKU-PRO-42",
            "quantity": 1,
            "unitPrice": 89
          }
        ],
        "shippingAddress": "123 Market St, San Francisco CA"
      },
      "response": {
        "orderId": "ord_99014",
        "status": "ORDER_PLACED",
        "total": 89
      }
    },
    "GetOrderStatus": {
      "description": "Query order status and tracking number",
      "request": {
        "orderId": "ord_99014"
      },
      "response": {
        "orderId": "ord_99014",
        "status": "PROCESSING",
        "estimatedDelivery": "2026-09-15"
      }
    },
    "CancelOrder": {
      "description": "Abort pending order prior to carrier dispatch",
      "request": {
        "orderId": "ord_99014",
        "reason": "Customer requested cancellation"
      },
      "response": {
        "orderId": "ord_99014",
        "status": "CANCELLED"
      }
    },
    "StreamOrderEvents": {
      "description": "Server-side stream of live fulfillment and tracking telemetry",
      "request": {
        "orderId": "ord_99014"
      },
      "response": {
        "eventId": "evt_7701",
        "state": "CARRIER_PICKED_UP",
        "carrier": "FedEx Express"
      }
    }
  }
}
```
{% endraw %}

## Validate the example

Save the example as `node.json` in the repository root, then run:

```bash
node -e "const { SHACLValidator } = require('./packages/robos-graph/lib/shacl-validator'); console.log(new SHACLValidator().validate([require('./node.json')]).conforms)"
```

The command prints `true` when the node meets every rule for its types.
