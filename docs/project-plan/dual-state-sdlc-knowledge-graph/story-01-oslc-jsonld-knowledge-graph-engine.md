# Story 32.01: OSLC Core 3.0 & JSON-LD + SHACL Standard Knowledge Graph Engine

**Epic:** [Dual-State SDLC Knowledge Graph & E2E-Driven Verification Engine](epic.md)  
**Status:** Done  
**Points:** 8  

---

## 1. Overview & Problem Statement

To enable AI agents, developers, project managers, and architects to share a complete, unambiguous understanding of a software ecosystem, RobOS requires a standardized knowledge graph format. Using ad-hoc JSON structures or proprietary databases leads to fragmentation, loss of semantics, and vendor lock-in.

Story 32.01 implements the **RobOS Knowledge Graph Engine** (`packages/robos-graph`), standardizing on **OASIS OSLC (Open Services for Lifecycle Collaboration) Core 3.0** and **W3C JSON-LD / SHACL (Shapes Constraint Language)**.

### Core Directive: "Reinvent Nothing!"
- **Lifecycle Standard**: [OASIS OSLC Core 3.0 Specification](https://open-services.net/specifications/core/core-3.0.html) (defines Requirements, Architecture Management, Change Management, Quality Management, and Automation domains as linked RDF resources).
- **Format**: [W3C JSON-LD 1.1](https://www.w3.org/TR/json-ld11/).
- **Constraint Validation**: [W3C SHACL (Shapes Constraint Language)](https://www.w3.org/TR/shacl/).
- **Storage Location**: `.robos/knowledge-graph.jsonld` and `.robos/shapes/`.

---

## 2. Acceptance Criteria

- [x] JSON-LD knowledge graph strictly validates against OSLC Core 3.0 ontologies and SHACL shapes.
- [x] SPARQL and JSON-LD frame queries execute in under 10ms for graphs with 1,000+ nodes.
- [x] AI agents can discover system topology, contracts, and requirements via MCP query tools.
- [x] Verified with unit and automated E2E tests (`packages/robos-test/tests/sdlc-graph/robos-graph.test.js`) and persistent walkthrough archive in `~/.robos/development/walkthroughs/robos-graph/`.
