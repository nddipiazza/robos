---
name: schema-lookup
description: Query Schema.org, OASIS OSLC, and definitive semantic vocabularies, inspect inheritance lineages, validate JSON-LD, and synthesize RobOS Knowledge Graph shapes.
---

# Schema.org & Definitive Standards Lookup (`schema-lookup`)

Provides AI coding agents (Claude Code, Google Antigravity, GitHub Copilot, Gemini CLI) with programmatic access to the canonical **Schema.org** vocabulary (~1,000+ classes, 1,600+ properties), **OASIS OSLC 3.0**, **W3C LOV**, and **RobOS SHACL shapes**.

## When to Use

- Grounding newly created software entities, databases, or microservices in standard Schema.org parent classes (`rdfs:subClassOf`).
- Discovering canonical properties and expected value types for an entity (e.g. `operatingSystem`, `downloadUrl`, `applicationCategory`).
- Validating JSON-LD payloads for compliance with Schema.org and W3C SHACL constraint shapes.
- Synthesizing new RobOS Knowledge Graph shapes, TypeSpec 0.61 domain models, and polyglot code bindings.

## Command Execution

Use the bundled CLI script:
```bash
# Search for classes and properties
node plugins/robos/skills/schema-lookup/scripts/schema-query.js search <query>

# Search only classes linked to RobOS SHACL shapes
node plugins/robos/skills/schema-lookup/scripts/schema-query.js search <query> --standard ROBOS_ONLY

# Inspect a specific Schema.org class (lineage, direct/inherited properties, RobOS links)
node plugins/robos/skills/schema-lookup/scripts/schema-query.js type <className>

# Inspect property domains and allowed ranges
node plugins/robos/skills/schema-lookup/scripts/schema-query.js property <propertyName>

# Validate a JSON-LD payload or file against Schema.org & SHACL constraints
node plugins/robos/skills/schema-lookup/scripts/schema-query.js validate <file.jsonld>

# Synthesize a new RobOS entity specification suite (JSON-LD, TypeSpec, SHACL, polyglot stubs)
node plugins/robos/skills/schema-lookup/scripts/schema-query.js synthesize <className> --name <CustomEntityName>
```

## Examples

### 1. Lookup `SoftwareApplication`
```bash
node plugins/robos/skills/schema-lookup/scripts/schema-query.js type SoftwareApplication
```

### 2. Synthesize a Payment Gateway Entity
```bash
node plugins/robos/skills/schema-lookup/scripts/schema-query.js synthesize SoftwareApplication --name PaymentGatewayService
```

### 3. Validate a KGraph Node
```bash
node plugins/robos/skills/schema-lookup/scripts/schema-query.js validate '{"@type": ["robos:Microservice", "schema:SoftwareApplication"], "schema:name": "Order Service"}'
```
