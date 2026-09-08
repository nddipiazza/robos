---
title: Contract
layout: default
parent: Services & Contracts (robos.services)
grand_parent: KGraph Schemas
nav_order: 2
permalink: /schemas/services/contract.html
---

# Schema: `robos:Contract`
{: .no_toc }

Formal W3C SHACL constraint shape and OSLC JSON-LD specification for `robos:Contract` in the `services` package store.
{: .fs-6 .fw-300 }

## Table of contents
{: .no_toc .text-delta }

1. TOC
{:toc}

---

## Specification Metadata

- **RDF / OWL Class**: `robos:Contract`
- **Aliases / Target Classes**: `robos:Contract`
- **SHACL Shape ID**: `urn:robos:shape:ContractShape`
- **Governing Package**: [Services & Contracts (robos.services)]({{ '/schemas/services.html' | relative_url }}) (`services`)
- **Namespace**: `robos.services`

---

## Entity Relationship & Schema Context

<div style="margin: 1.5rem 0; padding: 1.25rem; background: #161b22; border: 1px solid #30363d; border-radius: 8px;">
  <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.75rem; flex-wrap: wrap; gap: 0.5rem;">
    <span style="font-size: 1.15rem; font-weight: 700; color: #38bdf8;">Contract</span>
    <span style="font-family: monospace; background: #121927; color: #00e5ff; border: 1px solid rgba(0, 229, 255, 0.4); padding: 0.2rem 0.6rem; border-radius: 6px; font-size: 0.85rem;">robos:Contract</span>
  </div>
  <p style="margin-bottom: 0.75rem; font-size: 0.92rem; color: #c9d1d9;">Governed by W3C SHACL shape <code>urn:robos:shape:ContractShape</code> within the <strong>Services & Contracts (robos.services)</strong> (<code>robos.services</code>) package store.</p>
  <div style="display: flex; flex-wrap: wrap; gap: 0.5rem; margin-top: 0.5rem;">
    <span style="background: #0d1117; border: 1px solid #21262d; padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.8rem; color: #8b949e;"><code>robos:specFile</code></span>
    <span style="background: #0d1117; border: 1px solid #21262d; padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.8rem; color: #8b949e;"><code>robos:protocol</code></span>
  </div>
</div>

---

## Property Constraints & SHACL Rules

| Property Path | Name | Multiplicity | Data Type | Constraint Rule / Validation Message |
|---|---|---|---|---|
| **`robos:specFile`** | Specification File | `1..*` | `xsd:string` | Contract must specify a specification file path. |
| **`robos:protocol`** | Protocol / Standard | `1..*` | `xsd:string` | Contract must declare a protocol (OpenAPI, Pact, etc.). |

---

## Canonical OSLC JSON-LD Example

```json
{
  "@id": "urn:robos:services:contract-sample",
  "@type": [
    "robos:Contract",
    "oslc:Resource"
  ],
  "dcterms:title": "Sample Contract",
  "dcterms:description": "Canonical reference instance for robos:Contract.",
  "robos:package": "services",
  "robos:namespace": "robos.services",
  "robos:specFile": "specs/contracts/sample-v1.yaml",
  "robos:protocol": "OpenAPI 3.1"
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
        "@id": "urn:robos:services:contract-sample",
        "@type": [
            "robos:Contract",
            "oslc:Resource"
        ],
        "dcterms:title": "Sample Contract",
        "dcterms:description": "Canonical reference instance for robos:Contract.",
        "robos:package": "services",
        "robos:namespace": "robos.services",
        "robos:specFile": "specs/contracts/sample-v1.yaml",
        "robos:protocol": "OpenAPI 3.1"
    }
  ],
}));

console.log("Conforms:", result.conforms); // Expected: true
```