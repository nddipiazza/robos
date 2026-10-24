---
title: "Services & Contracts (robos.services)"
layout: default
parent: Schemas
nav_order: 3
has_children: true
permalink: /schemas/services.html
description: "Microservices, API contracts (OpenAPI, Protobuf, GraphQL), endpoints, data models, requirements and features."
---

# Services & Contracts (robos.services)
{: .no_toc }

Microservices, API contracts (OpenAPI, Protobuf, GraphQL), endpoints, data models, requirements and features.
{: .fs-6 }

| | |
|---|---|
| Package id | `services` |
| Namespace | `robos.services` |
| Package file | `.robos/kgraphs/services/package.jsonld` |
| Classes documented | 8 |

## Classes

Required properties are the ones with a minimum count of 1 or more. A node that lacks one fails validation.

| Class | Shape | Required properties |
|---|---|---|
| [Microservice (`robos:Microservice`)]({{ '/schemas/services/microservice.html' | relative_url }}) | `urn:robos:shape:MicroserviceShape` | `robos:repository`, `dcterms:title` |
| [Contract (`robos:Contract`)]({{ '/schemas/services/contract.html' | relative_url }}) | `urn:robos:shape:ContractShape` | `robos:specFile`, `robos:protocol` |
| [Requirement (`oslc_rm:Requirement`)]({{ '/schemas/services/requirement.html' | relative_url }}) | `urn:robos:shape:RequirementShape` | `dcterms:title`, `robos:featureFile` |
| [Protobuf Contract (`robos:ProtobufContract`)]({{ '/schemas/services/protobuf-contract.html' | relative_url }}) | `urn:robos:shape:ProtobufContractShape` | `dcterms:title`, `robos:specFile`, `robos:packageName`, `robos:rpcMethods` |
| [GraphQL Contract (`robos:GraphQLContract`)]({{ '/schemas/services/graphql-contract.html' | relative_url }}) | `urn:robos:shape:GraphQLContractShape` | `dcterms:title`, `robos:specFile`, `robos:schemaType` |
| [Feature (`robos:Feature`)]({{ '/schemas/services/feature.html' | relative_url }}) | `urn:robos:shape:FeatureShape` | `dcterms:title` |
| [API Endpoint (`robos:APIEndpoint`)]({{ '/schemas/services/api-endpoint.html' | relative_url }}) | `urn:robos:shape:APIEndpointShape` | `dcterms:title`, `robos:pathPattern`, `robos:httpMethod` |
| [Data Model (`robos:DataModel`)]({{ '/schemas/services/data-model.html' | relative_url }}) | `urn:robos:shape:DataModelShape` | `dcterms:title`, `robos:modelName` |
