---
name: kgraph-validate
description: Run full W3C SHACL shape validation across all Modular KGraph Packages to ensure 100% schema conformance.
---

# Knowledge Graph SHACL Validation (`kgraph-validate`)

Validate all nodes across all modular package stores (or a target package) against the official W3C SHACL constraint shapes.

## When to Use
- Pre-commit verification before pushing architectural changes.
- CI/CD pipeline gating to guarantee zero invalid nodes or broken references.
- Validating newly generated or imported application definitions.

## Execution
```bash
# Validate entire Knowledge Graph (all packages)
node packages/robos-graph/bin/kgraph-cli.js validate

# Validate specific package in JSON mode
node packages/robos-graph/bin/kgraph-cli.js validate services --json
```
