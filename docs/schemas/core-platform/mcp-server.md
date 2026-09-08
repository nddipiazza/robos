---
title: MCP Server
layout: default
parent: Core Platform (robos.core)
grand_parent: KGraph Schemas
nav_order: 5
permalink: /schemas/core-platform/mcp-server.html
---

# Schema: `robos:MCPServer`
{: .no_toc }

Formal W3C SHACL constraint shape and OSLC JSON-LD specification for `robos:MCPServer` in the `core-platform` package store.
{: .fs-6 .fw-300 }

## Table of contents
{: .no_toc .text-delta }

1. TOC
{:toc}

---

## Specification Metadata

- **RDF / OWL Class**: `robos:MCPServer`
- **Aliases / Target Classes**: `robos:MCPServer`, `robos:ToolProvider`
- **SHACL Shape ID**: `urn:robos:shape:MCPServerShape`
- **Governing Package**: [Core Platform (robos.core)]({{ '/schemas/core-platform.html' | relative_url }}) (`core-platform`)
- **Namespace**: `robos.platform`

---

## Entity Relationship & Schema Context

<div style="margin: 1.5rem 0; padding: 1.25rem; background: #161b22; border: 1px solid #30363d; border-radius: 8px;">
  <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.75rem; flex-wrap: wrap; gap: 0.5rem;">
    <span style="font-size: 1.15rem; font-weight: 700; color: #38bdf8;">MCP Server</span>
    <span style="font-family: monospace; background: #121927; color: #00e5ff; border: 1px solid rgba(0, 229, 255, 0.4); padding: 0.2rem 0.6rem; border-radius: 6px; font-size: 0.85rem;">robos:MCPServer</span>
  </div>
  <p style="margin-bottom: 0.75rem; font-size: 0.92rem; color: #c9d1d9;">Governed by W3C SHACL shape <code>urn:robos:shape:MCPServerShape</code> within the <strong>Core Platform (robos.core)</strong> (<code>robos.platform</code>) package store.</p>
  <div style="display: flex; flex-wrap: wrap; gap: 0.5rem; margin-top: 0.5rem;">
    <span style="background: #0d1117; border: 1px solid #21262d; padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.8rem; color: #8b949e;"><code>dcterms:title</code></span>
    <span style="background: #0d1117; border: 1px solid #21262d; padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.8rem; color: #8b949e;"><code>robos:transport</code></span>
    <span style="background: #0d1117; border: 1px solid #21262d; padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.8rem; color: #8b949e;"><code>robos:toolsProvided</code></span>
  </div>
</div>

---

## Property Constraints & SHACL Rules

| Property Path | Name | Multiplicity | Data Type | Constraint Rule / Validation Message |
|---|---|---|---|---|
| **`dcterms:title`** | Title / Display Name | `1..*` | `xsd:string` | MCP Server must have a title or display name. |
| **`robos:transport`** | transport | `1..*` | `xsd:string` | MCP Server must declare transport protocol (stdio, sse). |
| **`robos:toolsProvided`** | toolsProvided | `1..*` | `xsd:string` | MCP Server must list at least one provided tool. |

---

## Canonical OSLC JSON-LD Example

```json
{
  "@id": "urn:robos:mcp:context-engine",
  "@type": [
    "oslc_am:Resource",
    "robos:MCPServer",
    "robos:ToolProvider"
  ],
  "dcterms:title": "RobOS Code Context MCP Server",
  "dcterms:description": "Stdio MCP server exposing AST symbols, codebase indexing, and symbol resolution.",
  "robos:transport": "stdio",
  "robos:command": "/usr/local/bin/robos-context-mcp",
  "robos:toolsProvided": [
    "ast_search",
    "symbol_lookup",
    "dependency_graph"
  ],
  "robos:package": "core-platform",
  "robos:namespace": "robos.platform"
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
        "@id": "urn:robos:mcp:context-engine",
        "@type": [
            "oslc_am:Resource",
            "robos:MCPServer",
            "robos:ToolProvider"
        ],
        "dcterms:title": "RobOS Code Context MCP Server",
        "dcterms:description": "Stdio MCP server exposing AST symbols, codebase indexing, and symbol resolution.",
        "robos:transport": "stdio",
        "robos:command": "/usr/local/bin/robos-context-mcp",
        "robos:toolsProvided": [
            "ast_search",
            "symbol_lookup",
            "dependency_graph"
        ],
        "robos:package": "core-platform",
        "robos:namespace": "robos.platform"
    }
  ],
}));

console.log("Conforms:", result.conforms); // Expected: true
```