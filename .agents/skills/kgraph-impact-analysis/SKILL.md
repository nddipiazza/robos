---
name: kgraph-impact-analysis
description: Trace upstream and downstream blast radiuses and transitive dependencies before modifying any service, database, or contract.
---

# Knowledge Graph Impact Analysis & Blast Radius (`kgraph-impact-analysis`)

Trace all incoming and outgoing dependency edges recursively to determine the blast radius of changing an architectural node before writing code.

## When to Use
- Evaluating the ripple effect before altering a database schema or OpenAPI contract.
- Calculating which downstream client applications or microservices must be regression tested.
- Generating pre-PR blast radius summaries for code reviews.

## Execution
```bash
# Check blast radius of changing auth-service up to 3 hops
node packages/robos-graph/bin/kgraph-cli.js impact "urn:robos:service:forms-api" --depth 3

# Export impact graph as JSON
node packages/robos-graph/bin/kgraph-cli.js impact "urn:robos:service:forms-api" --json
```
