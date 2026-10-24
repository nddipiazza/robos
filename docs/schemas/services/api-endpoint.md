---
title: API Endpoint
layout: default
parent: "Services & Contracts (robos.services)"
grand_parent: Schemas
nav_order: 7
permalink: /schemas/services/api-endpoint.html
description: "Validation shape for robos:APIEndpoint nodes in the services package group."
---

# robos:APIEndpoint
{: .no_toc }

Validation shape for `robos:APIEndpoint` nodes in the `services` package group.
{: .fs-6 }

## Details

| | |
|---|---|
| Class | `robos:APIEndpoint` |
| Also matches | `robos:APIOperation` |
| Shape id | `urn:robos:shape:APIEndpointShape` |
| Package | [Services & Contracts (robos.services)]({{ '/schemas/services.html' | relative_url }}) (`services`) |
| Classification | Contracts & data models |
| Schema.org type | [`schema:EntryPoint`](https://schema.org/EntryPoint) |
| Domain standard | [OpenAPI 3.1](https://spec.openapis.org/oas/v3.1.0) |

## Properties

Count is the minimum and maximum number of values (`*` means no maximum). The validator enforces both. The type column is documentation only; the validator does not check types.

| Property | Count | Type | Rule or description |
|---|---|---|---|
| `dcterms:title` | `1..*` | `xsd:string` | API Endpoint must have a title or summary. |
| `robos:pathPattern` | `1..*` | `xsd:string` | API Endpoint must declare path pattern (e.g. /api/v1/orders). |
| `robos:httpMethod` | `1..*` | `xsd:string` | API Endpoint must declare HTTP method (GET, POST, etc.). |

## Example node

This node comes from `.robos/kgraphs/services/package.jsonld` in the RobOS repository. That graph holds sample data for a fictional company, so treat the values as illustrations.

{% raw %}
```json
{
  "@id": "urn:robos:endpoint:orders-list",
  "@type": [
    "robos:APIEndpoint",
    "robos:APIOperation",
    "c4:Component"
  ],
  "dcterms:title": "Query Orders",
  "dcterms:description": "Retrieve customer purchase orders.",
  "robos:pathPattern": "/api/v1/orders",
  "robos:httpMethod": "GET",
  "robos:service": {
    "@id": "urn:robos:service:order-service"
  },
  "robos:endpointOf": {
    "@id": "urn:robos:service:order-service"
  },
  "robos:contract": {
    "@id": "urn:robos:contract:order-service-v1"
  },
  "robos:package": "services",
  "robos:namespace": "robos.services",
  "robos:schemaOrgType": "https://schema.org/EntryPoint",
  "robos:domainStandard": "https://spec.openapis.org/oas/v3.1.0"
}
```
{% endraw %}

## Validate the example

Save the example as `node.json` in the repository root, then run:

```bash
node -e "const { SHACLValidator } = require('./packages/robos-graph/lib/shacl-validator'); console.log(new SHACLValidator().validate([require('./node.json')]).conforms)"
```

The command prints `true` when the node meets every rule for its types.
