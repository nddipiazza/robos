---
title: Agent Persona
layout: default
parent: Organization & Teams (robos.org)
grand_parent: KGraph Schemas
nav_order: 5
permalink: /schemas/organization/agent-persona.html
---

# Schema: `robos:AgentPersona`
{: .no_toc }

Formal W3C SHACL constraint shape and OSLC JSON-LD specification for `robos:AgentPersona` in the `organization` package store.
{: .fs-6 .fw-300 }

## Table of contents
{: .no_toc .text-delta }

1. TOC
{:toc}

---

## Specification Metadata

- **RDF / OWL Class**: `robos:AgentPersona`
- **Aliases / Target Classes**: `robos:AgentPersona`, `robos:AIAgent`
- **SHACL Shape ID**: `urn:robos:shape:AgentPersonaShape`
- **Governing Package**: [Organization & Teams (robos.org)]({{ '/schemas/organization.html' | relative_url }}) (`organization`)
- **Namespace**: `robos.org`

---

## Entity Relationship & Schema Context

<div style="margin: 1.5rem 0; padding: 1.25rem; background: #161b22; border: 1px solid #30363d; border-radius: 8px;">
  <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.75rem; flex-wrap: wrap; gap: 0.5rem;">
    <span style="font-size: 1.15rem; font-weight: 700; color: #38bdf8;">Agent Persona</span>
    <span style="font-family: monospace; background: #121927; color: #00e5ff; border: 1px solid rgba(0, 229, 255, 0.4); padding: 0.2rem 0.6rem; border-radius: 6px; font-size: 0.85rem;">robos:AgentPersona</span>
  </div>
  <p style="margin-bottom: 0.75rem; font-size: 0.92rem; color: #c9d1d9;">Governed by W3C SHACL shape <code>urn:robos:shape:AgentPersonaShape</code> within the <strong>Organization & Teams (robos.org)</strong> (<code>robos.org</code>) package store.</p>
  <div style="display: flex; flex-wrap: wrap; gap: 0.5rem; margin-top: 0.5rem;">
    <span style="background: #0d1117; border: 1px solid #21262d; padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.8rem; color: #8b949e;"><code>dcterms:title</code></span>
    <span style="background: #0d1117; border: 1px solid #21262d; padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.8rem; color: #8b949e;"><code>robos:role</code></span>
    <span style="background: #0d1117; border: 1px solid #21262d; padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.8rem; color: #8b949e;"><code>robos:systemPrompt</code></span>
  </div>
</div>

---

## Property Constraints & SHACL Rules

| Property Path | Name | Multiplicity | Data Type | Constraint Rule / Validation Message |
|---|---|---|---|---|
| **`dcterms:title`** | Title / Display Name | `1..*` | `xsd:string` | Agent Persona must have a title or name. |
| **`robos:role`** | role | `1..*` | `xsd:string` | Agent Persona must specify an autonomous role. |
| **`robos:systemPrompt`** | systemPrompt | `1..*` | `xsd:string` | Agent Persona must provide a system prompt or core directive. |

---

## Canonical OSLC JSON-LD Example

```json
{
  "@id": "urn:robos:agent:pr-reviewer",
  "@type": [
    "oslc:Person",
    "robos:AgentPersona",
    "robos:AIAgent"
  ],
  "dcterms:title": "RobOS Autonomous PR Code Reviewer",
  "dcterms:description": "Automated AI pull request auditor performing static analysis, contract checks, and semantic diff evaluation.",
  "robos:role": "Autonomous Pull Request Auditor",
  "robos:systemPrompt": "Audit pull request diffs against architectural rules, OpenAPI specs, and SHACL shapes.",
  "robos:modelPreference": "claude-sonnet-5",
  "robos:assignedTeam": "urn:robos:team:core-platform",
  "robos:usesMCPServer": [
    "urn:robos:mcp:context-engine",
    "urn:robos:mcp:kgraph-navigator"
  ],
  "robos:package": "organization",
  "robos:namespace": "robos.org"
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
        "@id": "urn:robos:agent:pr-reviewer",
        "@type": [
            "oslc:Person",
            "robos:AgentPersona",
            "robos:AIAgent"
        ],
        "dcterms:title": "RobOS Autonomous PR Code Reviewer",
        "dcterms:description": "Automated AI pull request auditor performing static analysis, contract checks, and semantic diff evaluation.",
        "robos:role": "Autonomous Pull Request Auditor",
        "robos:systemPrompt": "Audit pull request diffs against architectural rules, OpenAPI specs, and SHACL shapes.",
        "robos:modelPreference": "claude-sonnet-5",
        "robos:assignedTeam": "urn:robos:team:core-platform",
        "robos:usesMCPServer": [
            "urn:robos:mcp:context-engine",
            "urn:robos:mcp:kgraph-navigator"
        ],
        "robos:package": "organization",
        "robos:namespace": "robos.org"
    }
  ],
}));

console.log("Conforms:", result.conforms); // Expected: true
```