---
title: CICDPipeline
layout: default
parent: DevOps & Cloud (robos.devops)
grand_parent: KGraph Schemas
nav_order: 6
permalink: /schemas/devops/cicdpipeline.html
---

# Schema: `robos:CICDPipeline`
{: .no_toc }

Formal W3C SHACL constraint shape and OSLC JSON-LD specification for `robos:CICDPipeline` in the `devops` package store.
{: .fs-6 .fw-300 }

## Table of contents
{: .no_toc .text-delta }

1. TOC
{:toc}

---

## Specification Metadata

- **RDF / OWL Class**: `robos:CICDPipeline`
- **Aliases / Target Classes**: `robos:CICDPipeline`, `robos:Pipeline`
- **SHACL Shape ID**: `urn:robos:shape:CICDPipelineShape`
- **Governing Package**: [DevOps & Cloud (robos.devops)]({{ '/schemas/devops.html' | relative_url }}) (`devops`)
- **Namespace**: `robos.devops`

---

## Entity Relationship & Schema Context

<div style="margin: 1.5rem 0; padding: 1.25rem; background: #161b22; border: 1px solid #30363d; border-radius: 8px;">
  <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.75rem; flex-wrap: wrap; gap: 0.5rem;">
    <span style="font-size: 1.15rem; font-weight: 700; color: #38bdf8;">CICDPipeline</span>
    <span style="font-family: monospace; background: #121927; color: #00e5ff; border: 1px solid rgba(0, 229, 255, 0.4); padding: 0.2rem 0.6rem; border-radius: 6px; font-size: 0.85rem;">robos:CICDPipeline</span>
  </div>
  <p style="margin-bottom: 0.75rem; font-size: 0.92rem; color: #c9d1d9;">Governed by W3C SHACL shape <code>urn:robos:shape:CICDPipelineShape</code> within the <strong>DevOps & Cloud (robos.devops)</strong> (<code>robos.devops</code>) package store.</p>
  <div style="display: flex; flex-wrap: wrap; gap: 0.5rem; margin-top: 0.5rem;">
    <span style="background: #0d1117; border: 1px solid #21262d; padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.8rem; color: #8b949e;"><code>dcterms:title</code></span>
    <span style="background: #0d1117; border: 1px solid #21262d; padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.8rem; color: #8b949e;"><code>robos:platform</code></span>
    <span style="background: #0d1117; border: 1px solid #21262d; padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.8rem; color: #8b949e;"><code>robos:workflowFile</code></span>
  </div>
</div>

---

## Property Constraints & SHACL Rules

| Property Path | Name | Multiplicity | Data Type | Constraint Rule / Validation Message |
|---|---|---|---|---|
| **`dcterms:title`** | Title / Display Name | `1..*` | `xsd:string` | CI/CD Pipeline must have a title. |
| **`robos:platform`** | Target Platform | `1..*` | `xsd:string` | CI/CD Pipeline must declare platform (github-actions, gitlab-ci, jenkins). |
| **`robos:workflowFile`** | workflowFile | `1..*` | `xsd:string` | CI/CD Pipeline must specify workflow file path (.github/workflows/...). |

---

## Canonical OSLC JSON-LD Example

```json
{
  "@id": "urn:robos:pipeline:checkout-service-ci",
  "@type": [
    "oslc_qm:TestPlan",
    "robos:CICDPipeline",
    "robos:Pipeline"
  ],
  "dcterms:title": "Billing Service GitHub Actions CI/CD Pipeline",
  "dcterms:description": "Continuous integration pipeline executing lint, unit test, container build, and deployment.",
  "robos:platform": "github-actions",
  "robos:workflowFile": ".github/workflows/ci.yml",
  "robos:stages": [
    "lint",
    "test",
    "security-scan",
    "docker-build",
    "argocd-sync"
  ],
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
        "@id": "urn:robos:pipeline:checkout-service-ci",
        "@type": [
            "oslc_qm:TestPlan",
            "robos:CICDPipeline",
            "robos:Pipeline"
        ],
        "dcterms:title": "Billing Service GitHub Actions CI/CD Pipeline",
        "dcterms:description": "Continuous integration pipeline executing lint, unit test, container build, and deployment.",
        "robos:platform": "github-actions",
        "robos:workflowFile": ".github/workflows/ci.yml",
        "robos:stages": [
            "lint",
            "test",
            "security-scan",
            "docker-build",
            "argocd-sync"
        ],
        "robos:package": "devops",
        "robos:namespace": "robos.devops"
    }
  ],
}));

console.log("Conforms:", result.conforms); // Expected: true
```