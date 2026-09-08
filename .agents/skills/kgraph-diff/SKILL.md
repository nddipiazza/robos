---
name: kgraph-diff
description: Compute semantic blast radius diff comparing World 1 (Production main) against World 2 (feature branch or uncommitted changes).
---

# Knowledge Graph Semantic Diff (`kgraph-diff`)

Compare World 1 (Production `main` branch) against World 2 (feature branch or working tree) to detect added, modified, or removed architectural components and breaking changes.

## When to Use
- Pull request reviews on the RobOS Agent Code Review Platform.
- Detecting breaking API contract changes or dropped database columns before merge.
- Comparing architecture branches during technical design spikes.

## Execution
```bash
# Compare current feature branch against main
node packages/robos-graph/bin/kgraph-cli.js diff

# Compare specific branch
node packages/robos-graph/bin/kgraph-cli.js diff feature/orders-v2 --base main
```
