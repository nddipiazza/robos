---
title: Contract
layout: default
parent: "Services & Contracts"
grand_parent: Schemas
nav_order: 2
permalink: /schemas/services/contract.html
---

# robos:Contract
{: .no_toc }

Validation shape for `robos:Contract` nodes in the `services` package group.
{: .fs-6 }

## Details

| Detail | Value |
|---|---|
| Class | `robos:Contract` |
| Shape id | `urn:robos:shape:ContractShape` |
| Package | [Services & Contracts]({{ '/schemas/services.html' | relative_url }}) (`services`) |
| Classification | Contracts & data models |
| Schema.org type | [`schema:DigitalDocument`](https://schema.org/DigitalDocument) |
| Domain standard | [OSLC AM](http://open-services.net/ns/am#Resource) |

## Properties

Count is the minimum and maximum number of values (`*` means no maximum). The validator enforces both. The type column is documentation only; the validator does not check types.

| Property | Count | Type | Rule or description |
|---|---|---|---|
| `robos:specFile` | `1..*` | `xsd:string` | Contract must specify a specification file path. |
| `robos:protocol` | `1..*` | `xsd:string` | Contract must declare a protocol (OpenAPI, Pact, etc.). |

## Example node

This node comes from `.robos/kgraphs/services/package.jsonld` in the RobOS repository. That graph holds sample data for a fictional company, so treat the values as illustrations.

{% raw %}
```json
{
  "@id": "urn:robos:contract:catalog-graphql",
  "@type": [
    "robos:Contract",
    "robos:GraphQLContract",
    "robos:GraphQLSchema",
    "schema:DigitalDocument"
  ],
  "dcterms:title": "Acme Catalog GraphQL SDL Schema",
  "dcterms:description": "Apollo Federation subgraph schema defining products, pricing, and category queries.",
  "robos:protocol": "graphql",
  "robos:specFile": "schemas/catalog.graphql",
  "robos:schemaType": "federated-subgraph",
  "robos:package": "services",
  "robos:namespace": "robos.services",
  "robos:schemaOrgType": "https://schema.org/DigitalDocument",
  "robos:domainStandard": "http://open-services.net/ns/am#Resource",
  "robos:sdlSchema": "type Query {\n  product(id: ID!): Product\n  products(category: String, limit: Int = 20): [Product!]!\n  searchCatalog(term: String!): [Product!]!\n}\n\ntype Mutation {\n  createProduct(input: ProductInput!): Product!\n  updatePrice(id: ID!, newPrice: Float!): Product!\n}\n\ntype Product {\n  id: ID!\n  name: String!\n  sku: String!\n  category: String!\n  price: Float!\n  inStock: Boolean!\n}\n\ninput ProductInput {\n  name: String!\n  sku: String!\n  category: String!\n  price: Float!\n}",
  "robos:graphqlOperations": [
    {
      "name": "ListCatalogProducts",
      "type": "query",
      "query": "query ListCatalogProducts {\n  products(limit: 5) {\n    id\n    name\n    price\n    inStock\n  }\n}"
    },
    {
      "name": "GetProductById",
      "type": "query",
      "query": "query GetProductById($id: ID!) {\n  product(id: $id) {\n    id\n    name\n    sku\n    price\n    inStock\n  }\n}",
      "variables": {
        "id": "prod_101"
      }
    }
  ]
}
```
{% endraw %}

## Validate the example

Save the example as `node.json` in the repository root, then run:

```bash
node -e "const { SHACLValidator } = require('./packages/robos-graph/lib/shacl-validator'); console.log(new SHACLValidator().validate([require('./node.json')]).conforms)"
```

The command prints `true` when the node meets every rule for its types.
