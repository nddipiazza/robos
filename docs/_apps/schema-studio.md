---
title: "Schema Studio & Registry"
package: schema-studio
category: arch-planning
icon: schema-studio.svg
summary: "Schema.org ontology explorer, TypeSpec domain modeling, W3C SHACL synthesis, and live JSON-LD validator."
---

The semantic command center and ontology explorer bridging Schema.org, OASIS OSLC, and W3C standards with native developer tooling:
- **Canonical Schema.org Explorer**: Real-time browsing and fuzzy search across **classes** and **properties** directly indexed from `schemaorg-current-https.jsonld`.
- **Inheritance & Lineage Traversal**: Visual taxonomy inheritance trees (`Thing` → `CreativeWork` → `SoftwareApplication`) with full direct and inherited property tables, domain definitions, and expected range types.
- **Definitive Standards Integration**: First-class grounding in **OASIS OSLC 3.0** (Change, Requirements, Architecture, and Quality Management), **W3C Linked Open Vocabularies (LOV)**, **W3C C4 Model**, and **Cucumber Gherkin BDD**.
- **Dual-State Knowledge Graph Synthesis**: Push-button generation of dual-typed JSON-LD instances (`["robos:Microservice", "schema:SoftwareApplication"]`), W3C SHACL constraint shapes (`sh:NodeShape`), and TypeSpec 0.61 domain models with polyglot bindings (TypeScript Zod, Java 21 Record, Python Pydantic v2, Go struct).
- **Interactive JSON-LD Conformance Linter**: Built-in validation workbench verifying payloads against Schema.org types and RobOS SHACL shapes with immediate diagnostic feedback.
- **AI Agent Skill & MCP Server Integration**: Equips autonomous agents (Claude Code, Google Antigravity, Copilot CLI, Gemini) with the `schema-lookup` skill and `robos_schema_lookup`, `robos_schema_validate`, and `robos_schema_synthesize` MCP tools.
![Schema Studio]({{ '/assets/images/screenshots/schema-studio-frame_01.png' | relative_url }})
