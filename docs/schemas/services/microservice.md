---
title: Microservice
layout: default
parent: "Services & Contracts (robos.services)"
grand_parent: Schemas
nav_order: 1
permalink: /schemas/services/microservice.html
---

# robos:Microservice
{: .no_toc }

Validation shape for `robos:Microservice` nodes in the `services` package group.
{: .fs-6 }

## Details

| | |
|---|---|
| Class | `robos:Microservice` |
| Shape id | `urn:robos:shape:MicroserviceShape` |
| Package | [Services & Contracts (robos.services)]({{ '/schemas/services.html' | relative_url }}) (`services`) |
| Classification | Services & processing |
| Schema.org type | [`schema:SoftwareApplication`](https://schema.org/SoftwareApplication) |
| Domain standard | [C4 model](https://w3id.org/c4/Container) |

## Properties

Count is the minimum and maximum number of values (`*` means no maximum). The validator enforces both. The type column is documentation only; the validator does not check types.

| Property | Count | Type | Rule or description |
|---|---|---|---|
| `robos:repository` | `1..1` | `xsd:string` | Microservice must define exactly one repository. |
| `robos:ownerTeam` | `0..*` | `URI (robos:Team)` | Record an owner team when known; unknown ownership must not be fabricated. |
| `dcterms:title` | `1..*` | `xsd:string` | Microservice must have a title. |

## Example node

This node comes from `.robos/kgraphs/services/package.jsonld` in the RobOS repository. That graph holds sample data for a fictional company, so treat the values as illustrations.

{% raw %}
```json
{
  "@id": "urn:robos:service:order-service",
  "@type": [
    "oslc_am:Resource",
    "c4:Container",
    "robos:Microservice"
  ],
  "dcterms:title": "Order Service (Local) Service",
  "dcterms:description": "Backend microservice powering Order Service (Local) capabilities with containerized deployment.",
  "robos:repository": "github.com/acme/order-service",
  "robos:technology": "Node.js 20 / TypeScript",
  "robos:implementsContract": "urn:robos:contract:order-service-v1",
  "robos:ownerTeam": "urn:robos:team:core-platform",
  "robos:hasProject": "urn:robos:project:enterprise-core",
  "robos:ports": [
    8080
  ],
  "robos:healthCheckUrl": "/healthz",
  "robos:inOrganization": "urn:robos:git-org:acme",
  "robos:localPath": "/home/developer/source/repos/order-service",
  "robos:package": "services",
  "robos:namespace": "robos.services"
}
```
{% endraw %}

## Validate the example

Save the example as `node.json` in the repository root, then run:

```bash
node -e "const { SHACLValidator } = require('./packages/robos-graph/lib/shacl-validator'); console.log(new SHACLValidator().validate([require('./node.json')]).conforms)"
```

The command prints `true` when the node meets every rule for its types.
