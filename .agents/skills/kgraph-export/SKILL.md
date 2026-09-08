---
name: kgraph-export
description: Export the Knowledge Graph or specific packages into standard semantic linked-data formats (JSON-LD 1.1, Turtle .ttl, N-Triples).
---

# Knowledge Graph Export (`kgraph-export`)

Export the RobOS Knowledge Graph or individual packages into standard RDF/Semantic Web formats: W3C JSON-LD 1.1, W3C Turtle (`.ttl`), or N-Triples.

## When to Use
- Exporting architecture data to external enterprise graph databases (Neo4j, Amazon Neptune, GraphDB).
- Publishing public open-source architecture catalogs.
- Integrating with external RDF linters or semantic analysis pipelines.

## Execution
```bash
# Export services package as Turtle (.ttl)
node packages/robos-graph/bin/kgraph-cli.js export --format ttl --package services --output ./services.ttl

# Export entire graph as aggregated JSON-LD
node packages/robos-graph/bin/kgraph-cli.js export --format jsonld --output ./full-graph.jsonld
```
