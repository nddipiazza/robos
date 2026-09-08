---
title: Pipeline Job
layout: default
parent: DevOps & Cloud (robos.devops)
grand_parent: KGraph Schemas
nav_order: 12
permalink: /schemas/devops/pipeline-job.html
---

# Schema: `robos:PipelineJob`
{: .no_toc }

Formal W3C SHACL constraint shape and OSLC JSON-LD specification for `robos:PipelineJob` in the `devops` package store.
{: .fs-6 .fw-300 }

## Table of contents
{: .no_toc .text-delta }

1. TOC
{:toc}

---

## Specification Metadata

- **RDF / OWL Class**: `robos:PipelineJob`
- **Aliases / Target Classes**: `robos:PipelineJob`
- **SHACL Shape ID**: `urn:robos:shape:PipelineJobShape`
- **Governing Package**: [DevOps & Cloud (robos.devops)]({{ '/schemas/devops.html' | relative_url }}) (`devops`)
- **Namespace**: `robos.devops`

---

## Entity Relationship & Schema Context

<div style="margin: 1.5rem 0; padding: 1.25rem; background: #161b22; border: 1px solid #30363d; border-radius: 8px;">
  <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.75rem; flex-wrap: wrap; gap: 0.5rem;">
    <span style="font-size: 1.15rem; font-weight: 700; color: #38bdf8;">Pipeline Job</span>
    <span style="font-family: monospace; background: #121927; color: #00e5ff; border: 1px solid rgba(0, 229, 255, 0.4); padding: 0.2rem 0.6rem; border-radius: 6px; font-size: 0.85rem;">robos:PipelineJob</span>
  </div>
  <p style="margin-bottom: 0.75rem; font-size: 0.92rem; color: #c9d1d9;">Governed by W3C SHACL shape <code>urn:robos:shape:PipelineJobShape</code> within the <strong>DevOps & Cloud (robos.devops)</strong> (<code>robos.devops</code>) package store.</p>
  <div style="display: flex; flex-wrap: wrap; gap: 0.5rem; margin-top: 0.5rem;">
    <span style="background: #0d1117; border: 1px solid #21262d; padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.8rem; color: #8b949e;"><code>dcterms:title</code></span>
    <span style="background: #0d1117; border: 1px solid #21262d; padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.8rem; color: #8b949e;"><code>robos:jobName</code></span>
    <span style="background: #0d1117; border: 1px solid #21262d; padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.8rem; color: #8b949e;"><code>robos:stage</code></span>
  </div>
</div>

---

## Property Constraints & SHACL Rules

| Property Path | Name | Multiplicity | Data Type | Constraint Rule / Validation Message |
|---|---|---|---|---|
| **`dcterms:title`** | Title / Display Name | `1..*` | `xsd:string` | Pipeline Job must have a title. |
| **`robos:jobName`** | Pipeline Job Name | `1..*` | `xsd:string` | Pipeline Job must specify job name. |
| **`robos:stage`** | Parent Pipeline Stage | `1..*` | `URI (robos:PipelineStage)` | Pipeline Job must link to parent pipeline stage. |

---

## Canonical OSLC JSON-LD Example

```json
{
  "@id": "urn:robos:devops:pipeline-job-sample",
  "@type": [
    "robos:PipelineJob",
    "oslc:Resource"
  ],
  "dcterms:title": "Sample Pipeline Job",
  "dcterms:description": "Canonical reference instance for robos:PipelineJob.",
  "robos:package": "devops",
  "robos:namespace": "robos.devops",
  "robos:jobName": "unit-tests",
  "robos:stage": "urn:robos:stage:build"
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
        "@id": "urn:robos:devops:pipeline-job-sample",
        "@type": [
            "robos:PipelineJob",
            "oslc:Resource"
        ],
        "dcterms:title": "Sample Pipeline Job",
        "dcterms:description": "Canonical reference instance for robos:PipelineJob.",
        "robos:package": "devops",
        "robos:namespace": "robos.devops",
        "robos:jobName": "unit-tests",
        "robos:stage": "urn:robos:stage:build"
    }
  ],
}));

console.log("Conforms:", result.conforms); // Expected: true
```