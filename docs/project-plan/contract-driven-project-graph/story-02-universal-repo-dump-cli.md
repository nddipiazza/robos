---
nav_exclude: true
---

# Story 27-02: Universal Repository Dump CLI (`robos-graph dump`)

**Epic:** [Contract-Driven Project Knowledge Graph & Autonomous Deployment Engine](epic.md)
**Status:** Not started
**Points:** 8

## Description

Implement `robos-graph dump <repo-path>`, an ingestion tool that parses any Git repository into a `.robos/project-graph.json-ld` file. Uses `tree-sitter` and `SCIP` for bottom-up AST extraction (Godot scenes/GDScript, JS/TS, Python, C#), combined with schema-constrained LLM extraction (BAML / Instructor) to infer feature hierarchies, task contracts, and BDD criteria from docs and commit logs.

## Acceptance Criteria

- [ ] Command `robos-graph dump <repo>` scans project files and generates valid `.robos/project-graph.json-ld`.
- [ ] Correctly extracts Godot `.tscn` nodes, GDScript `.gd` methods/signals, and test files.
- [ ] Generates initial feature & task DAG by parsing READMEs, issue trackers, and commit history.
- [ ] Guaranteed valid output schema matching `packages/robos-graph` JSON Schema specifications.
