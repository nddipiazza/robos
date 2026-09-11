---
title: Code Snippet
layout: default
parent: Documentation & Diagrams (robos.docs)
grand_parent: KGraph Schemas
nav_order: 5
permalink: /schemas/documentation/code-snippet.html
---

# Schema: `robos:CodeSnippet`
{: .no_toc }

Formal W3C SHACL constraint shape and OSLC JSON-LD specification for `robos:CodeSnippet` in the `documentation` package store.
{: .fs-6 .fw-300 }

## Table of contents
{: .no_toc .text-delta }

1. TOC
{:toc}

---

## Specification Metadata

- **RDF / OWL Class**: `robos:CodeSnippet`
- **Aliases / Target Classes**: `robos:CodeSnippet`, `robos:CodeSample`
- **SHACL Shape ID**: `urn:robos:shape:CodeSnippetShape`
- **Governing Package**: [Documentation & Diagrams (robos.docs)]({{ '/schemas/documentation.html' | relative_url }}) (`documentation`)
- **Namespace**: `robos.docs`
- **Schema.org Classification**: [https://schema.org/SoftwareSourceCode](https://schema.org/SoftwareSourceCode)
- **Domain De Facto Standard**: [https://schema.org/SoftwareSourceCode](https://schema.org/SoftwareSourceCode)
- **Upstream Schema Basis (Refers From)**: [https://schema.org/SoftwareSourceCode](https://schema.org/SoftwareSourceCode)

---

## Upstream Schema Basis (Refers From) & Global Standards Provenance

This RobOS schema is modeled after and directly aligns with two levels of global standards:
- **Universal Schema.org Class**: [https://schema.org/SoftwareSourceCode](https://schema.org/SoftwareSourceCode) (100% interoperability with search engines, web indexers, and general AI reasoning)
- **Specialized Domain Standard**: [https://schema.org/SoftwareSourceCode](https://schema.org/SoftwareSourceCode) (de facto standard for domain-specific ALM, BDD, or infrastructure operations)
- **Canonical Reference**: [https://schema.org/SoftwareSourceCode](https://schema.org/SoftwareSourceCode)
- **Agent Guidelines**: When autonomous agents generate, expand, or validate instances of `robos:CodeSnippet`, they MUST adhere to and base their output on this referred schema object and universal Schema.org parent class, extending it with RobOS SDLC properties.

---

## Entity Relationship & Schema Context

<div style="margin: 1.5rem 0; padding: 1.25rem; background: #161b22; border: 1px solid #30363d; border-radius: 8px;">
  <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.75rem; flex-wrap: wrap; gap: 0.5rem;">
    <span style="font-size: 1.15rem; font-weight: 700; color: #38bdf8;">Code Snippet</span>
    <span style="font-family: monospace; background: #121927; color: #00e5ff; border: 1px solid rgba(0, 229, 255, 0.4); padding: 0.2rem 0.6rem; border-radius: 6px; font-size: 0.85rem;">robos:CodeSnippet</span>
  </div>
  <p style="margin-bottom: 0.75rem; font-size: 0.92rem; color: #c9d1d9;">Governed by W3C SHACL shape <code>urn:robos:shape:CodeSnippetShape</code> within the <strong>Documentation & Diagrams (robos.docs)</strong> (<code>robos.docs</code>) package store.</p>
  <div style="display: flex; flex-wrap: wrap; gap: 0.5rem; margin-top: 0.5rem;">
    <span style="background: #0d1117; border: 1px solid #21262d; padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.8rem; color: #8b949e;"><code>dcterms:title</code></span>
    <span style="background: #0d1117; border: 1px solid #21262d; padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.8rem; color: #8b949e;"><code>robos:language</code></span>
    <span style="background: #0d1117; border: 1px solid #21262d; padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.8rem; color: #8b949e;"><code>robos:code</code></span>
  </div>
</div>

---

**RobOS classification:** Documentation & decisions. These RobOS-owned codes use Schema.org CategoryCode vocabulary.

## Property Constraints & SHACL Rules

| Property Path | Name | Multiplicity | Data Type | Classification | Constraint Rule / Validation Message |
|---|---|---|---|---|---|
| **`dcterms:title`** | Title / Display Name | `1..*` | `xsd:string` | Services & processing, Applications & entry points, Contracts & data models, Data stores & messaging, Libraries & build systems, Infrastructure & delivery, Organization & people, Projects & work items, Source control & artifacts, Agents & MCP, Documentation & decisions, Learning & assessment, Testing & behavior | Code Snippet must have a title. |
| **`robos:language`** | Programming Language | `1..*` | `xsd:string` | Documentation & decisions, Testing & behavior | Code Snippet must specify a programming language. |
| **`robos:code`** | Source Code Content | `1..*` | `xsd:string` | Documentation & decisions | Code Snippet must provide source code text. |

---

## Canonical OSLC JSON-LD Example

```json
{
  "@id": "urn:robos:snippet:shacl-custom-validation",
  "@type": [
    "oslc_am:Resource",
    "robos:CodeSnippet",
    "robos:CodeSample",
    "schema:SoftwareSourceCode"
  ],
  "dcterms:title": "SHACL Custom Shape Programmatic Validation",
  "robos:language": "javascript",
  "robos:code": "const { SHACLValidator } = require('robos-graph');\nconst validator = new SHACLValidator();\nconst report = validator.validate(graphStore.parser);\nconsole.log('Conforms:', report.conforms);",
  "dcterms:description": "Canonical example of running in-memory SHACL validation against a parsed OSLC knowledge graph.",
  "robos:package": "documentation",
  "robos:namespace": "robos.docs",
  "robos:schemaOrgType": "https://schema.org/SoftwareSourceCode",
  "robos:domainStandard": "https://schema.org/SoftwareSourceCode"
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
        "@id": "urn:robos:snippet:shacl-custom-validation",
        "@type": [
            "oslc_am:Resource",
            "robos:CodeSnippet",
            "robos:CodeSample",
            "schema:SoftwareSourceCode"
        ],
        "dcterms:title": "SHACL Custom Shape Programmatic Validation",
        "robos:language": "javascript",
        "robos:code": "const { SHACLValidator } = require('robos-graph');\nconst validator = new SHACLValidator();\nconst report = validator.validate(graphStore.parser);\nconsole.log('Conforms:', report.conforms);",
        "dcterms:description": "Canonical example of running in-memory SHACL validation against a parsed OSLC knowledge graph.",
        "robos:package": "documentation",
        "robos:namespace": "robos.docs",
        "robos:schemaOrgType": "https://schema.org/SoftwareSourceCode",
        "robos:domainStandard": "https://schema.org/SoftwareSourceCode"
    }
  ],
}));

console.log("Conforms:", result.conforms); // Expected: true
```