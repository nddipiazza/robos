---
title: "Services & Contracts"
layout: default
parent: Schemas
nav_order: 3
has_children: true
permalink: /schemas/services.html
---

# Services & Contracts (robos.services)
{: .no_toc }

Microservices, API contracts (OpenAPI, Protobuf, GraphQL), endpoints, data models, requirements and features.
{: .fs-6 }

| Detail | Value |
|---|---|
| Package id | `services` |
| Namespace | `robos.services` |
| Package file | `.robos/kgraphs/services/package.jsonld` |
| Classes documented | 8 |

## Classes

Required properties are the ones with a minimum count of 1 or more. A node that lacks one fails validation.

| Class | Node type | Required properties |
|---|---|---|
| [Microservice]({{ '/schemas/services/microservice.html' | relative_url }}) | `robos:Microservice` | `robos:repository`, `dcterms:title` |
| [Contract]({{ '/schemas/services/contract.html' | relative_url }}) | `robos:Contract` | `robos:specFile`, `robos:protocol` |
| [Requirement]({{ '/schemas/services/requirement.html' | relative_url }}) | `oslc_rm:Requirement` | `dcterms:title`, `robos:featureFile` |
| [Protobuf Contract]({{ '/schemas/services/protobuf-contract.html' | relative_url }}) | `robos:ProtobufContract` | `dcterms:title`, `robos:specFile`, `robos:packageName`, `robos:rpcMethods` |
| [GraphQL Contract]({{ '/schemas/services/graphql-contract.html' | relative_url }}) | `robos:GraphQLContract` | `dcterms:title`, `robos:specFile`, `robos:schemaType` |
| [Feature]({{ '/schemas/services/feature.html' | relative_url }}) | `robos:Feature` | `dcterms:title` |
| [API Endpoint]({{ '/schemas/services/api-endpoint.html' | relative_url }}) | `robos:APIEndpoint` | `dcterms:title`, `robos:pathPattern`, `robos:httpMethod` |
| [Data Model]({{ '/schemas/services/data-model.html' | relative_url }}) | `robos:DataModel` | `dcterms:title`, `robos:modelName` |
