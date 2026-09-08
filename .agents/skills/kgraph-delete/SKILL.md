---
name: kgraph-delete
description: Remove a node from the Knowledge Graph and optionally prune cascading references across dependent nodes.
---

# Knowledge Graph Delete (`kgraph-delete`)

Safely remove a decommissioned application, microservice, or resource node from its modular package store, with optional cascade cleanup of inbound reference edges.

## When to Use
- Decommissioning a legacy microservice, deprecated contract, or retired database cluster.
- Pruning dangling nodes without corrupting package JSON-LD schemas.

## Execution
```bash
# Delete a node safely
node packages/robos-graph/bin/kgraph-cli.js delete "urn:robos:service:legacy-auth"

# Delete a node and remove references from all consuming services
node packages/robos-graph/bin/kgraph-cli.js delete "urn:robos:service:legacy-auth" --cascade
```
