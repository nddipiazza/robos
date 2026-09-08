---
name: kgraph-update
description: Update properties, contracts, dependencies, or tags on an existing Knowledge Graph node with automatic SHACL re-validation.
---

# Knowledge Graph Update (`kgraph-update`)

Update properties, contracts, dependencies, or metadata on an existing Knowledge Graph node with automatic SHACL shape re-validation.

## When to Use
- Attaching a new OpenAPI specification or database connection to an existing microservice.
- Updating the owner squad or AI model preference on an agent persona.
- Modifying environment variables or deployment clusters.

## Execution
```bash
# Update a property via key=value
node packages/robos-graph/bin/kgraph-cli.js update "urn:robos:service:orders-api" --set "robos:ownerTeam=urn:robos:team:checkout-squad"

# Update node via JSON patch file
node packages/robos-graph/bin/kgraph-cli.js update "urn:robos:service:orders-api" --file ./patch.json
```
