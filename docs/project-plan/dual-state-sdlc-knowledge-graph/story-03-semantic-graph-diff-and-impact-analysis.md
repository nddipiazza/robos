# Story 32.03: Semantic Graph Diff & Blast Radius Impact Analysis

**Epic:** [Dual-State SDLC Knowledge Graph & E2E-Driven Verification Engine](epic.md)  
**Status:** Done  
**Points:** 8  

---

## 1. Overview & Problem Statement

When an AI agent or developer proposes a change in a feature, POC, or pilot branch, human reviewers need to see the exact architectural and contractual blast radius. Traditional `git diff` only shows raw line-by-line code changes, making it difficult to spot broken upstream dependencies, modified entity schemas, or newly introduced microservice links.

Story 32.03 delivers the **Semantic Graph Diff & Blast Radius Analyzer** (`packages/robos-graph/lib/graph-diff.js`), computing structured semantic differences between `main` (Production) and any target branch.

---

## 2. Acceptance Criteria

- [x] Graph diff calculates in <100ms for graphs up to 2,000 nodes.
- [x] Visual canvas renders added nodes in green, deleted in red, and modified in orange.
- [x] Blast radius accurately flags all downstream services and teams affected by contract mutations.
- [x] Diff results are attached as metadata to AI implementation plans and pull requests.
- [x] Verified with unit and automated E2E tests (`packages/robos-test/tests/sdlc-graph/graph-diff.test.js`) and persistent walkthrough archive in `~/.robos/development/walkthroughs/graph-diff/`.
