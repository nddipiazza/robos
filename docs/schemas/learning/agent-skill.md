---
title: Agent Skill
layout: default
parent: eLearning Curriculums (robos.learning)
grand_parent: KGraph Schemas
nav_order: 7
permalink: /schemas/learning/agent-skill.html
---

# Schema: `robos:AgentSkill`
{: .no_toc }

Formal W3C SHACL constraint shape and OSLC JSON-LD specification for `robos:AgentSkill` in the `learning` package store.
{: .fs-6 .fw-300 }

## Table of contents
{: .no_toc .text-delta }

1. TOC
{:toc}

---

## Specification Metadata

- **RDF / OWL Class**: `robos:AgentSkill`
- **Aliases / Target Classes**: `robos:AgentSkill`
- **SHACL Shape ID**: `robos:AgentSkillShape`
- **Governing Package**: [eLearning Curriculums (robos.learning)]({{ '/schemas/learning.html' | relative_url }}) (`learning`)
- **Namespace**: `robos.learning`
- **Schema.org Classification**: [https://schema.org/HowTo](https://schema.org/HowTo)
- **Domain De Facto Standard**: [https://schema.org/HowTo](https://schema.org/HowTo)
- **Upstream Schema Basis (Refers From)**: [https://schema.org/HowTo](https://schema.org/HowTo)

---

## Upstream Schema Basis (Refers From) & Global Standards Provenance

This RobOS schema is modeled after and directly aligns with two levels of global standards:
- **Universal Schema.org Class**: [https://schema.org/HowTo](https://schema.org/HowTo) (100% interoperability with search engines, web indexers, and general AI reasoning)
- **Specialized Domain Standard**: [https://schema.org/HowTo](https://schema.org/HowTo) (de facto standard for domain-specific ALM, BDD, or infrastructure operations)
- **Canonical Reference**: [https://schema.org/HowTo](https://schema.org/HowTo)
- **Agent Guidelines**: When autonomous agents generate, expand, or validate instances of `robos:AgentSkill`, they MUST adhere to and base their output on this referred schema object and universal Schema.org parent class, extending it with RobOS SDLC properties.

---

## Entity Relationship & Schema Context

<div style="margin: 1.5rem 0; padding: 1.25rem; background: #161b22; border: 1px solid #30363d; border-radius: 8px;">
  <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.75rem; flex-wrap: wrap; gap: 0.5rem;">
    <span style="font-size: 1.15rem; font-weight: 700; color: #38bdf8;">Agent Skill</span>
    <span style="font-family: monospace; background: #121927; color: #00e5ff; border: 1px solid rgba(0, 229, 255, 0.4); padding: 0.2rem 0.6rem; border-radius: 6px; font-size: 0.85rem;">robos:AgentSkill</span>
  </div>
  <p style="margin-bottom: 0.75rem; font-size: 0.92rem; color: #c9d1d9;">Governed by W3C SHACL shape <code>robos:AgentSkillShape</code> within the <strong>eLearning Curriculums (robos.learning)</strong> (<code>robos.learning</code>) package store.</p>
  <div style="display: flex; flex-wrap: wrap; gap: 0.5rem; margin-top: 0.5rem;">
    <span style="background: #0d1117; border: 1px solid #21262d; padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.8rem; color: #8b949e;"><code>dcterms:title</code></span>
    <span style="background: #0d1117; border: 1px solid #21262d; padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.8rem; color: #8b949e;"><code>robos:skillName</code></span>
    <span style="background: #0d1117; border: 1px solid #21262d; padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.8rem; color: #8b949e;"><code>robos:sourcePath</code></span>
    <span style="background: #0d1117; border: 1px solid #21262d; padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.8rem; color: #8b949e;"><code>robos:inRepository</code></span>
    <span style="background: #0d1117; border: 1px solid #21262d; padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.8rem; color: #8b949e;"><code>robos:evidence</code></span>
  </div>
</div>

---

**RobOS classification:** Agents & MCP. These RobOS-owned codes use Schema.org CategoryCode vocabulary.

## Property Constraints & SHACL Rules

| Property Path | Name | Multiplicity | Data Type | Classification | Constraint Rule / Validation Message |
|---|---|---|---|---|---|
| **`dcterms:title`** | Title / Display Name | `1..*` | `xsd:string` | Services & processing, Applications & entry points, Contracts & data models, Data stores & messaging, Libraries & build systems, Infrastructure & delivery, Organization & people, Projects & work items, Source control & artifacts, Agents & MCP, Documentation & decisions, Learning & assessment, Testing & behavior | Agent skill needs a title. |
| **`robos:skillName`** | skillName | `1..*` | `xsd:string` | Agents & MCP | Agent skill needs its declared name. |
| **`robos:sourcePath`** | sourcePath | `1..*` | `xsd:string` | Source control & artifacts, Agents & MCP, Learning & assessment | Agent skill needs its instruction file. |
| **`robos:inRepository`** | inRepository | `1..*` | `xsd:string` | Source control & artifacts, Agents & MCP | Agent skill needs its repository reference. |
| **`robos:evidence`** | evidence | `1..*` | `xsd:string` | Data stores & messaging, Infrastructure & delivery, Source control & artifacts, Agents & MCP, Learning & assessment | Agent skill needs source evidence. |

---

## Canonical OSLC JSON-LD Example

```json
{
  "@id": "urn:robos:source:import-skill",
  "@type": [
    "robos:AgentSkill",
    "schema:HowTo"
  ],
  "dcterms:title": "Evidence-backed graph import skill",
  "robos:package": "learning",
  "robos:sourcePath": "plugins/robos/skills/import-company-kgraph/SKILL.md",
  "robos:sourceKind": "implementation",
  "robos:inRepository": {
    "@id": "urn:robos:source:workspace"
  },
  "robos:evidence": [
    {
      "repository": "robos",
      "path": "plugins/robos/skills/import-company-kgraph/SKILL.md",
      "line": 1
    }
  ],
  "robos:skillName": "import-company-kgraph",
  "robos:uses": {
    "@id": "urn:robos:source:source-extractor"
  },
  "robos:namespace": "robos.learning"
}
```

---

## Programmatic SHACL Validation

```javascript
const { SHACLValidator } = require('/usr/local/share/robos/robos-graph/lib/shacl-validator');
const { OSLCGraphParser, OSLC_CONTEXT } = require('/usr/local/share/robos/robos-graph/lib/oslc-parser');

const validator = new SHACLValidator();
const result = validator.validateGraph(new OSLCGraphParser({
  "@context": OSLC_CONTEXT,
  "robos:nodes": [
    {
        "@id": "urn:robos:source:import-skill",
        "@type": [
            "robos:AgentSkill",
            "schema:HowTo"
        ],
        "dcterms:title": "Evidence-backed graph import skill",
        "robos:package": "learning",
        "robos:sourcePath": "plugins/robos/skills/import-company-kgraph/SKILL.md",
        "robos:sourceKind": "implementation",
        "robos:inRepository": {
            "@id": "urn:robos:source:workspace"
        },
        "robos:evidence": [
            {
                "repository": "robos",
                "path": "plugins/robos/skills/import-company-kgraph/SKILL.md",
                "line": 1
            }
        ],
        "robos:skillName": "import-company-kgraph",
        "robos:uses": {
            "@id": "urn:robos:source:source-extractor"
        },
        "robos:namespace": "robos.learning"
    }
  ],
}));

console.log("Conforms:", result.conforms); // Expected: true
```