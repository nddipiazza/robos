---
title: Environment
layout: default
parent: DevOps & Cloud (robos.devops)
grand_parent: KGraph Schemas
nav_order: 4
permalink: /schemas/devops/environment.html
---

# Schema: `robos:Environment`
{: .no_toc }

Formal W3C SHACL constraint shape and OSLC JSON-LD specification for `robos:Environment` in the `devops` package store.
{: .fs-6 .fw-300 }

## Table of contents
{: .no_toc .text-delta }

1. TOC
{:toc}

---

## Specification Metadata

- **RDF / OWL Class**: `robos:Environment`
- **Aliases / Target Classes**: `robos:Environment`, `robos:DeploymentEnvironment`
- **SHACL Shape ID**: `urn:robos:shape:EnvironmentShape`
- **Governing Package**: [DevOps & Cloud (robos.devops)]({{ '/schemas/devops.html' | relative_url }}) (`devops`)
- **Namespace**: `robos.devops`

---

## Entity Relationship & Schema Context

<div style="margin: 1.5rem 0; padding: 1.25rem; background: #161b22; border: 1px solid #30363d; border-radius: 8px;">
  <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.75rem; flex-wrap: wrap; gap: 0.5rem;">
    <span style="font-size: 1.15rem; font-weight: 700; color: #38bdf8;">Environment</span>
    <span style="font-family: monospace; background: #121927; color: #00e5ff; border: 1px solid rgba(0, 229, 255, 0.4); padding: 0.2rem 0.6rem; border-radius: 6px; font-size: 0.85rem;">robos:Environment</span>
  </div>
  <p style="margin-bottom: 0.75rem; font-size: 0.92rem; color: #c9d1d9;">Governed by W3C SHACL shape <code>urn:robos:shape:EnvironmentShape</code> within the <strong>DevOps & Cloud (robos.devops)</strong> (<code>robos.devops</code>) package store.</p>
  <div style="display: flex; flex-wrap: wrap; gap: 0.5rem; margin-top: 0.5rem;">
    <span style="background: #0d1117; border: 1px solid #21262d; padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.8rem; color: #8b949e;"><code>dcterms:title</code></span>
    <span style="background: #0d1117; border: 1px solid #21262d; padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.8rem; color: #8b949e;"><code>robos:environmentType</code></span>
    <span style="background: #0d1117; border: 1px solid #21262d; padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.8rem; color: #8b949e;"><code>robos:tier</code></span>
  </div>
</div>

---

## Property Constraints & SHACL Rules

| Property Path | Name | Multiplicity | Data Type | Constraint Rule / Validation Message |
|---|---|---|---|---|
| **`dcterms:title`** | Title / Display Name | `1..*` | `xsd:string` | Environment must have a title. |
| **`robos:environmentType`** | environmentType | `1..*` | `xsd:string` | Environment must declare environment type (production, staging, development, test, sandbox). |
| **`robos:tier`** | tier | `1..*` | `xsd:string` | Environment must declare SLA/criticality tier. |

---

## Canonical OSLC JSON-LD Example

```json
{
  "@id": "urn:robos:env:production",
  "@type": [
    "oslc_am:Resource",
    "robos:Environment",
    "robos:DeploymentEnvironment"
  ],
  "dcterms:title": "Production Environment",
  "dcterms:description": "High-availability production tier serving external customer traffic.",
  "robos:environmentType": "production",
  "robos:tier": "tier-1",
  "robos:package": "devops",
  "robos:namespace": "robos.devops"
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
        "@id": "urn:robos:env:production",
        "@type": [
            "oslc_am:Resource",
            "robos:Environment",
            "robos:DeploymentEnvironment"
        ],
        "dcterms:title": "Production Environment",
        "dcterms:description": "High-availability production tier serving external customer traffic.",
        "robos:environmentType": "production",
        "robos:tier": "tier-1",
        "robos:package": "devops",
        "robos:namespace": "robos.devops"
    }
  ],
}));

console.log("Conforms:", result.conforms); // Expected: true
```