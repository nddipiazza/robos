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

## Entity Relationship Diagram

```mermaid
graph LR
    ThisNode["BuildSystem<br/><code>robos:BuildSystem</code>"]:::primary
    classDef primary fill:#16243b,stroke:#00e5ff,stroke-width:2.5px,color:#ffffff;
```

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