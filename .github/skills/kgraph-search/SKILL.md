---
name: kgraph-search
description: Search Knowledge Graph nodes across all packages by text query, RDF type, owner team, or tags.
---

# Knowledge Graph Search (`kgraph-search`)

Search through all modular packages in the RobOS SDLC Knowledge Graph (`.robos/kgraphs/`) by text query, RDF type, owner team, or tags.

## When to Use
- Discover existing microservices, databases, API contracts, or applications in the architecture before creating new ones.
- Find components managed by a specific squad or tagged with specific keywords.
- Locate entity identifiers (URIs) for dependency linking.

## Execution
```bash
# Search for microservices or databases matching 'orders'
node packages/robos-graph/bin/kgraph-cli.js search "orders" --type robos:Microservice

# Search within services package
node packages/robos-graph/bin/kgraph-cli.js search "" --package services --json
```
