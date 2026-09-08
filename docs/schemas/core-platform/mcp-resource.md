---
title: MCP Resource
layout: default
parent: Core Platform (robos.core)
grand_parent: KGraph Schemas
nav_order: 16
permalink: /schemas/core-platform/mcp-resource.html
---

# Schema: `robos:MCPResource`
{: .no_toc }

Formal W3C SHACL constraint shape and OSLC JSON-LD specification for `robos:MCPResource` in the `core-platform` package store.
{: .fs-6 .fw-300 }

## Table of contents
{: .no_toc .text-delta }

1. TOC
{:toc}

---

## Specification Metadata

- **RDF / OWL Class**: `robos:MCPResource`
- **Aliases / Target Classes**: `robos:MCPResource`
- **SHACL Shape ID**: `urn:robos:shape:MCPResourceShape`
- **Governing Package**: [Core Platform (robos.core)]({{ '/schemas/core-platform.html' | relative_url }}) (`core-platform`)
- **Namespace**: `robos.platform`
- **Schema.org Classification**: [https://schema.org/MediaObject](https://schema.org/MediaObject)
- **Domain De Facto Standard**: [https://modelcontextprotocol.io/specification](https://modelcontextprotocol.io/specification)
- **Upstream Schema Basis (Refers From)**: [https://schema.org/MediaObject](https://schema.org/MediaObject)

---

## Upstream Schema Basis (Refers From) & Global Standards Provenance

This RobOS schema is modeled after and directly aligns with two levels of global standards:
- **Universal Schema.org Class**: [https://schema.org/MediaObject](https://schema.org/MediaObject) (100% interoperability with search engines, web indexers, and general AI reasoning)
- **Specialized Domain Standard**: [https://modelcontextprotocol.io/specification](https://modelcontextprotocol.io/specification) (de facto standard for domain-specific ALM, BDD, or infrastructure operations)
- **Canonical Reference**: [https://schema.org/MediaObject](https://schema.org/MediaObject)
- **Agent Guidelines**: When autonomous agents generate, expand, or validate instances of `robos:MCPResource`, they MUST adhere to and base their output on this referred schema object and universal Schema.org parent class, extending it with RobOS SDLC properties.

---

## Entity Relationship & Schema Context

<div style="margin: 1.5rem 0; padding: 1.25rem; background: #161b22; border: 1px solid #30363d; border-radius: 8px;">
  <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.75rem; flex-wrap: wrap; gap: 0.5rem;">
    <span style="font-size: 1.15rem; font-weight: 700; color: #38bdf8;">MCP Resource</span>
    <span style="font-family: monospace; background: #121927; color: #00e5ff; border: 1px solid rgba(0, 229, 255, 0.4); padding: 0.2rem 0.6rem; border-radius: 6px; font-size: 0.85rem;">robos:MCPResource</span>
  </div>
  <p style="margin-bottom: 0.75rem; font-size: 0.92rem; color: #c9d1d9;">Governed by W3C SHACL shape <code>urn:robos:shape:MCPResourceShape</code> within the <strong>Core Platform (robos.core)</strong> (<code>robos.platform</code>) package store.</p>
  <div style="display: flex; flex-wrap: wrap; gap: 0.5rem; margin-top: 0.5rem;">
    <span style="background: #0d1117; border: 1px solid #21262d; padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.8rem; color: #8b949e;"><code>dcterms:title</code></span>
    <span style="background: #0d1117; border: 1px solid #21262d; padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.8rem; color: #8b949e;"><code>robos:uriTemplate</code></span>
    <span style="background: #0d1117; border: 1px solid #21262d; padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.8rem; color: #8b949e;"><code>robos:mcpServer</code></span>
  </div>
</div>

---

## Property Constraints & SHACL Rules

| Property Path | Name | Multiplicity | Data Type | Constraint Rule / Validation Message |
|---|---|---|---|---|
| **`dcterms:title`** | Title / Display Name | `1..*` | `xsd:string` | MCP Resource must have a title. |
| **`robos:uriTemplate`** | URI Template | `1..*` | `xsd:string` | MCP Resource must declare URI template. |
| **`robos:mcpServer`** | Parent MCP Server | `1..*` | `URI (robos:MCPServer)` | MCP Resource must link to parent MCP server. |

---

## Canonical OSLC JSON-LD Example

```json
{
  "@id": "urn:robos:core-platform:mcp-resource-sample",
  "@type": [
    "robos:MCPResource",
    "schema:MediaObject",
    "oslc:Resource"
  ],
  "dcterms:title": "Sample MCP Resource",
  "dcterms:description": "Canonical reference instance for robos:MCPResource.",
  "robos:package": "core-platform",
  "robos:namespace": "robos.platform",
  "robos:uriTemplate": "sample://resources/{id}",
  "robos:mcpServer": "urn:robos:mcp:context-engine",
  "robos:schemaOrgType": "https://schema.org/MediaObject",
  "robos:domainStandard": "https://modelcontextprotocol.io/specification",
  "robos:refersFrom": "https://schema.org/MediaObject"
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
        "@id": "urn:robos:core-platform:mcp-resource-sample",
        "@type": [
            "robos:MCPResource",
            "schema:MediaObject",
            "oslc:Resource"
        ],
        "dcterms:title": "Sample MCP Resource",
        "dcterms:description": "Canonical reference instance for robos:MCPResource.",
        "robos:package": "core-platform",
        "robos:namespace": "robos.platform",
        "robos:uriTemplate": "sample://resources/{id}",
        "robos:mcpServer": "urn:robos:mcp:context-engine",
        "robos:schemaOrgType": "https://schema.org/MediaObject",
        "robos:domainStandard": "https://modelcontextprotocol.io/specification",
        "robos:refersFrom": "https://schema.org/MediaObject"
    }
  ],
}));

console.log("Conforms:", result.conforms); // Expected: true
```