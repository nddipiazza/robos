---
name: kgraph-insert
description: Insert or register a new architectural node (Microservice, Database, MessageBroker, App, etc.) into the Knowledge Graph with W3C SHACL shape validation gate.
---

# Knowledge Graph Insert (`kgraph-insert`)

Insert a new architectural entity into the appropriate modular package store (`.robos/kgraphs/<pkg>/package.jsonld`) with an enforced W3C SHACL shape validation gate.

## When to Use
- Registering a newly scaffolded microservice, frontend application, database, or message broker.
- Adding a new API contract (OpenAPI 3.1 YAML, Protobuf gRPC stub, or GraphQL schema).
- Registering Model Context Protocol (MCP) servers or AI agent personas.

## Execution
```bash
# Insert node from JSON file with SHACL validation
node packages/robos-graph/bin/kgraph-cli.js insert --file ./new-service.json

# Insert node via CLI flags
node packages/robos-graph/bin/kgraph-cli.js insert \
  --id "urn:robos:service:billing-api" \
  --type robos:Microservice \
  --title "Billing Microservice" \
  --package services
```
