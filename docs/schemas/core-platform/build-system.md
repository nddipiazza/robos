---
title: Build System
layout: default
parent: Core Platform (robos.core)
grand_parent: KGraph Schemas
nav_order: 3
permalink: /schemas/core-platform/build-system.html
---

# Schema: `robos:BuildSystem`
{: .no_toc }

Formal W3C SHACL constraint shape and OSLC JSON-LD specification for `robos:BuildSystem` in the `core-platform` package store.
{: .fs-6 .fw-300 }

## Table of contents
{: .no_toc .text-delta }

1. TOC
{:toc}

---

## Specification Metadata

- **RDF / OWL Class**: `robos:BuildSystem`
- **Aliases / Target Classes**: `robos:BuildSystem`, `robos:MonorepoBuild`
- **SHACL Shape ID**: `urn:robos:shape:BuildSystemShape`
- **Governing Package**: [Core Platform (robos.core)]({{ '/schemas/core-platform.html' | relative_url }}) (`core-platform`)
- **Namespace**: `robos.platform`

---

## Entity Relationship & Schema Context

<div style="margin: 1.5rem 0; padding: 1.25rem; background: #161b22; border: 1px solid #30363d; border-radius: 8px;">
  <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.75rem; flex-wrap: wrap; gap: 0.5rem;">
    <span style="font-size: 1.15rem; font-weight: 700; color: #38bdf8;">Build System</span>
    <span style="font-family: monospace; background: #121927; color: #00e5ff; border: 1px solid rgba(0, 229, 255, 0.4); padding: 0.2rem 0.6rem; border-radius: 6px; font-size: 0.85rem;">robos:BuildSystem</span>
  </div>
  <p style="margin-bottom: 0.75rem; font-size: 0.92rem; color: #c9d1d9;">Governed by W3C SHACL shape <code>urn:robos:shape:BuildSystemShape</code> within the <strong>Core Platform (robos.core)</strong> (<code>robos.platform</code>) package store.</p>
  <div style="display: flex; flex-wrap: wrap; gap: 0.5rem; margin-top: 0.5rem;">
    <span style="background: #0d1117; border: 1px solid #21262d; padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.8rem; color: #8b949e;"><code>dcterms:title</code></span>
    <span style="background: #0d1117; border: 1px solid #21262d; padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.8rem; color: #8b949e;"><code>robos:buildTool</code></span>
    <span style="background: #0d1117; border: 1px solid #21262d; padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.8rem; color: #8b949e;"><code>robos:configFile</code></span>
  </div>
</div>

---

## Property Constraints & SHACL Rules

| Property Path | Name | Multiplicity | Data Type | Constraint Rule / Validation Message |
|---|---|---|---|---|
| **`dcterms:title`** | Title / Display Name | `1..*` | `xsd:string` | Build System must have a title. |
| **`robos:buildTool`** | Build Tool | `1..*` | `xsd:string` | Build System must declare build tool (bazel, buck2, pants, please). |
| **`robos:configFile`** | Config File | `1..*` | `xsd:string` | Build System must specify configuration file (.bazelrc, .buckconfig). |

---

## Canonical OSLC JSON-LD Example

```json
{
  "@id": "urn:robos:build-system:acme-monorepo-bazel",
  "@type": [
    "robos:BuildSystem",
    "robos:MonorepoBuild",
    "oslc:Resource"
  ],
  "dcterms:title": "Acme Core Services Monorepo (Bazel)",
  "dcterms:description": "Polyglot backend microservices and shared libraries built with Bazel.",
  "robos:buildTool": "bazel",
  "robos:configFile": ".bazelrc",
  "robos:repository": "github.com/acme/buildbarn-forms",
  "robos:hasRemoteExecution": "urn:robos:remote-execution:acme-buildbarn-cluster",
  "robos:defaultExecProperties": {
    "OSFamily": "linux",
    "ISA": "x86-64"
  },
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
        "@id": "urn:robos:build-system:acme-monorepo-bazel",
        "@type": [
            "robos:BuildSystem",
            "robos:MonorepoBuild",
            "oslc:Resource"
        ],
        "dcterms:title": "Acme Core Services Monorepo (Bazel)",
        "dcterms:description": "Polyglot backend microservices and shared libraries built with Bazel.",
        "robos:buildTool": "bazel",
        "robos:configFile": ".bazelrc",
        "robos:repository": "github.com/acme/buildbarn-forms",
        "robos:hasRemoteExecution": "urn:robos:remote-execution:acme-buildbarn-cluster",
        "robos:defaultExecProperties": {
            "OSFamily": "linux",
            "ISA": "x86-64"
        },
        "robos:package": "core-platform",
        "robos:namespace": "robos.platform"
    }
  ],
}));

console.log("Conforms:", result.conforms); // Expected: true
```