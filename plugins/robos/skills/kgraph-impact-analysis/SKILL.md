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

## Dependency semantics

Use an explicit `--graph-root /absolute/workspace` for every command. Impact
returns both `dependents` (who relies on this node) and `dependencies` (what this
node relies on), with shortest-hop depth, predicate and available relationship
evidence. Dependency direction is dependent → prerequisite. Repository membership,
source derivation, ownership and generic reference links are not dependency edges.
Conditional evidence remains conditional; transitive results identify candidates
for review, not proof that every condition is active together.

`query --depends-on <id> --depth 1 --json` filters direct modeled dependents;
increase depth for transitive candidates. `query --path-from ... --path-to ...`
traces directed reference connectivity, which is broader than dependency impact.
Do not treat an undirected connection, a shared repository or a zero-result query
as proof of dependency correctness or safe change. Inspect the cited source and
report unmodeled external packages/types and unknown relationships explicitly.
