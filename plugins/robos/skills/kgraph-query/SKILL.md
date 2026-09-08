---
name: kgraph-query
description: Query Knowledge Graph nodes by RDF type, package, dependencies, or trace connection paths between two entities.
---

# Knowledge Graph Query & Path Traversal (`kgraph-query`)

Execute multi-criteria graph queries or trace path traversals between two entities in the SDLC Knowledge Graph.

## When to Use
- Answering architecture questions: 'What services connect to the payments database?'
- Tracing connection paths between a frontend app and backend services across microservice boundaries.
- Filtering nodes by complex multi-property constraints.

## Execution
```bash
# Query all databases in the architecture
node packages/robos-graph/bin/kgraph-cli.js query --type robos:Database

# Trace path between storefront frontend and orders database
node packages/robos-graph/bin/kgraph-cli.js query \
  --path-from "urn:robos:app:storefront-web" \
  --path-to "urn:robos:db:postgres-orders"
```
