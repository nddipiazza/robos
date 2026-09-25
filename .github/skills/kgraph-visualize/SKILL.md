---
name: kgraph-visualize
description: Generate Mermaid diagrams or C4 component dependency visualizations for any node, squad, or package.
---

# Knowledge Graph Visualization (`kgraph-visualize`)

Generate executable Mermaid diagram syntax or C4 component visualizations for any node, package, or subsystem in the Knowledge Graph.

## When to Use
- Embedding visual architecture diagrams in pull request descriptions or documentation.
- Visualizing the microservice ecosystem around a focused component.
- Creating living diagrams for Architecture Decision Records (ADRs).

## Execution
```bash
# Generate Mermaid graph for services package
node packages/robos-graph/bin/kgraph-cli.js visualize services --direction TD

# Generate focused dependency graph around a single microservice
node packages/robos-graph/bin/kgraph-cli.js visualize "urn:robos:service:forms-api" --output ./forms-api.mmd
```
