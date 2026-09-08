---
title: Services & Contracts (robos.services)
layout: default
parent: KGraph Schemas
nav_order: 3
has_children: true
permalink: /schemas/services.html
---

# Services & Contracts (robos.services)
{: .no_toc }

Backend microservices, OpenAPI 3.1 specifications, gRPC reflection stubs, and BDD verification features.
{: .fs-6 .fw-300 }

## Table of contents
{: .no_toc .text-delta }

1. TOC
{:toc}

---

## Package Metadata

- **Package Store ID**: `services`
- **Ontology Namespace**: `robos.services`
- **GitOps Package File**: `.robos/kgraphs/services/package.jsonld`
- **Schemas Defined**: 8

---

## Package Schemas & Constraint Shapes

| Schema Class | Target Shape URI | Required Properties (minCount ≥ 1) | Specification |
|---|---|---|---|
| [**Microservice** (`robos:Microservice`)]({{ '/schemas/services/microservice.html' | relative_url }}) | `urn:robos:shape:MicroserviceShape` | `robos:repository`, `robos:ownerTeam`, `dcterms:title` | [View Schema &rarr;]({{ '/schemas/services/microservice.html' | relative_url }}) |
| [**Contract** (`robos:Contract`)]({{ '/schemas/services/contract.html' | relative_url }}) | `urn:robos:shape:ContractShape` | `robos:specFile`, `robos:protocol` | [View Schema &rarr;]({{ '/schemas/services/contract.html' | relative_url }}) |
| [**Requirement** (`oslc_rm:Requirement`)]({{ '/schemas/services/requirement.html' | relative_url }}) | `urn:robos:shape:RequirementShape` | `dcterms:title`, `robos:featureFile` | [View Schema &rarr;]({{ '/schemas/services/requirement.html' | relative_url }}) |
| [**Protobuf Contract** (`robos:ProtobufContract`)]({{ '/schemas/services/protobuf-contract.html' | relative_url }}) | `urn:robos:shape:ProtobufContractShape` | `dcterms:title`, `robos:specFile`, `robos:packageName`, `robos:rpcMethods` | [View Schema &rarr;]({{ '/schemas/services/protobuf-contract.html' | relative_url }}) |
| [**GraphQL Contract** (`robos:GraphQLContract`)]({{ '/schemas/services/graphql-contract.html' | relative_url }}) | `urn:robos:shape:GraphQLContractShape` | `dcterms:title`, `robos:specFile`, `robos:schemaType` | [View Schema &rarr;]({{ '/schemas/services/graphql-contract.html' | relative_url }}) |
| [**Feature** (`robos:Feature`)]({{ '/schemas/services/feature.html' | relative_url }}) | `urn:robos:shape:FeatureShape` | `dcterms:title` | [View Schema &rarr;]({{ '/schemas/services/feature.html' | relative_url }}) |
| [**API Endpoint** (`robos:APIEndpoint`)]({{ '/schemas/services/api-endpoint.html' | relative_url }}) | `urn:robos:shape:APIEndpointShape` | `dcterms:title`, `robos:pathPattern`, `robos:httpMethod` | [View Schema &rarr;]({{ '/schemas/services/api-endpoint.html' | relative_url }}) |
| [**Data Model** (`robos:DataModel`)]({{ '/schemas/services/data-model.html' | relative_url }}) | `urn:robos:shape:DataModelShape` | `dcterms:title`, `robos:modelName` | [View Schema &rarr;]({{ '/schemas/services/data-model.html' | relative_url }}) |

---

## Package Architecture & Linked Data Model

<div style="margin: 2rem 0; border: 1px solid #1e293b; border-radius: 12px; overflow: hidden; background: #0b101b; box-shadow: 0 10px 40px rgba(0,0,0,0.6);">
  <img src="{{ '/assets/images/kgraph-schemas-architecture.jpg' | relative_url }}" alt="Services & Contracts (robos.services) Ontology Map" class="robos-zoomable-img" style="display: block; width: 100%; height: auto;" />
  <div style="padding: 0.75rem 1.25rem; font-size: 0.85rem; color: #94a3b8; border-top: 1px solid #1e293b; background: #0d1424; text-align: center;">
    <strong>Services & Contracts (robos.services) (robos.services)</strong>: High-level package ontology within the RobOS Knowledge Graph. <em>(Click image to zoom full screen)</em>
  </div>
</div>