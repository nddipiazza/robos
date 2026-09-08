---
title: Sprint
layout: default
parent: Organization & Teams (robos.org)
grand_parent: KGraph Schemas
nav_order: 11
permalink: /schemas/organization/sprint.html
---

# Schema: `robos:Sprint`
{: .no_toc }

Formal W3C SHACL constraint shape and OSLC JSON-LD specification for `robos:Sprint` in the `organization` package store.
{: .fs-6 .fw-300 }

## Table of contents
{: .no_toc .text-delta }

1. TOC
{:toc}

---

## Specification Metadata

- **RDF / OWL Class**: `robos:Sprint`
- **Aliases / Target Classes**: `robos:Sprint`
- **SHACL Shape ID**: `urn:robos:shape:SprintShape`
- **Governing Package**: [Organization & Teams (robos.org)]({{ '/schemas/organization.html' | relative_url }}) (`organization`)
- **Namespace**: `robos.org`
- **Upstream Schema Basis (Refers From)**: [https://schema.org/Action](https://schema.org/Action)

---

## Upstream Schema Basis (Refers From)

This RobOS schema is modeled after and directly expands upon the upstream canonical standard:
- **Canonical Reference**: [https://schema.org/Action](https://schema.org/Action)
- **Provenance & Alignment**: When autonomous agents generate, expand, or validate instances of `robos:Sprint`, they MUST adhere to and base their output on this referred schema object, extending it with RobOS SDLC properties.

---

## Entity Relationship & Schema Context

<div style="margin: 1.5rem 0; padding: 1.25rem; background: #161b22; border: 1px solid #30363d; border-radius: 8px;">
  <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.75rem; flex-wrap: wrap; gap: 0.5rem;">
    <span style="font-size: 1.15rem; font-weight: 700; color: #38bdf8;">Sprint</span>
    <span style="font-family: monospace; background: #121927; color: #00e5ff; border: 1px solid rgba(0, 229, 255, 0.4); padding: 0.2rem 0.6rem; border-radius: 6px; font-size: 0.85rem;">robos:Sprint</span>
  </div>
  <p style="margin-bottom: 0.75rem; font-size: 0.92rem; color: #c9d1d9;">Governed by W3C SHACL shape <code>urn:robos:shape:SprintShape</code> within the <strong>Organization & Teams (robos.org)</strong> (<code>robos.org</code>) package store.</p>
  <div style="display: flex; flex-wrap: wrap; gap: 0.5rem; margin-top: 0.5rem;">
    <span style="background: #0d1117; border: 1px solid #21262d; padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.8rem; color: #8b949e;"><code>dcterms:title</code></span>
    <span style="background: #0d1117; border: 1px solid #21262d; padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.8rem; color: #8b949e;"><code>robos:status</code></span>
    <span style="background: #0d1117; border: 1px solid #21262d; padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.8rem; color: #8b949e;"><code>robos:startDate</code></span>
    <span style="background: #0d1117; border: 1px solid #21262d; padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.8rem; color: #8b949e;"><code>robos:endDate</code></span>
  </div>
</div>

---

## Property Constraints & SHACL Rules

| Property Path | Name | Multiplicity | Data Type | Constraint Rule / Validation Message |
|---|---|---|---|---|
| **`dcterms:title`** | Title / Display Name | `1..*` | `xsd:string` | Sprint must have a title or name. |
| **`robos:status`** | Lifecycle Status | `1..*` | `xsd:string` | Sprint must declare status (planning, active, completed). |
| **`robos:startDate`** | Start Date | `1..*` | `xsd:date` | Sprint must specify a start date. |
| **`robos:endDate`** | End Date | `1..*` | `xsd:date` | Sprint must specify an end date. |

---

## Canonical OSLC JSON-LD Example

```json
{
  "@id": "urn:robos:organization:sprint-sample",
  "@type": [
    "robos:Sprint",
    "oslc:Resource"
  ],
  "dcterms:title": "Sample Sprint",
  "dcterms:description": "Canonical reference instance for robos:Sprint.",
  "robos:package": "organization",
  "robos:namespace": "robos.org",
  "robos:status": "active",
  "robos:startDate": "2026-10-01",
  "robos:endDate": "2026-10-15",
  "robos:refersFrom": "https://schema.org/Action"
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
        "@id": "urn:robos:organization:sprint-sample",
        "@type": [
            "robos:Sprint",
            "oslc:Resource"
        ],
        "dcterms:title": "Sample Sprint",
        "dcterms:description": "Canonical reference instance for robos:Sprint.",
        "robos:package": "organization",
        "robos:namespace": "robos.org",
        "robos:status": "active",
        "robos:startDate": "2026-10-01",
        "robos:endDate": "2026-10-15",
        "robos:refersFrom": "https://schema.org/Action"
    }
  ],
}));

console.log("Conforms:", result.conforms); // Expected: true
```