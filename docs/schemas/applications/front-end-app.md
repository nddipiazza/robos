---
title: Front End App
layout: default
parent: Applications (robos.apps)
grand_parent: KGraph Schemas
nav_order: 5
permalink: /schemas/applications/front-end-app.html
---

# Schema: `robos:FrontEndApp`
{: .no_toc }

Formal W3C SHACL constraint shape and OSLC JSON-LD specification for `robos:FrontEndApp` in the `applications` package store.
{: .fs-6 .fw-300 }

## Table of contents
{: .no_toc .text-delta }

1. TOC
{:toc}

---

## Specification Metadata

- **RDF / OWL Class**: `robos:FrontEndApp`
- **Aliases / Target Classes**: `robos:FrontEndApp`
- **SHACL Shape ID**: `urn:robos:shape:FrontEndAppShape`
- **Governing Package**: [Applications (robos.apps)]({{ '/schemas/applications.html' | relative_url }}) (`applications`)
- **Namespace**: `robos.apps`

---

## Entity Relationship & Schema Context

<div style="margin: 1.5rem 0; padding: 1.25rem; background: #161b22; border: 1px solid #30363d; border-radius: 8px;">
  <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.75rem; flex-wrap: wrap; gap: 0.5rem;">
    <span style="font-size: 1.15rem; font-weight: 700; color: #38bdf8;">Front End App</span>
    <span style="font-family: monospace; background: #121927; color: #00e5ff; border: 1px solid rgba(0, 229, 255, 0.4); padding: 0.2rem 0.6rem; border-radius: 6px; font-size: 0.85rem;">robos:FrontEndApp</span>
  </div>
  <p style="margin-bottom: 0.75rem; font-size: 0.92rem; color: #c9d1d9;">Governed by W3C SHACL shape <code>urn:robos:shape:FrontEndAppShape</code> within the <strong>Applications (robos.apps)</strong> (<code>robos.apps</code>) package store.</p>
  <div style="display: flex; flex-wrap: wrap; gap: 0.5rem; margin-top: 0.5rem;">
    <span style="background: #0d1117; border: 1px solid #21262d; padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.8rem; color: #8b949e;"><code>dcterms:title</code></span>
    <span style="background: #0d1117; border: 1px solid #21262d; padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.8rem; color: #8b949e;"><code>robos:repository</code></span>
    <span style="background: #0d1117; border: 1px solid #21262d; padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.8rem; color: #8b949e;"><code>robos:technology</code></span>
    <span style="background: #0d1117; border: 1px solid #21262d; padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.8rem; color: #8b949e;"><code>robos:frontendFramework</code></span>
  </div>
</div>

---

## Property Constraints & SHACL Rules

| Property Path | Name | Multiplicity | Data Type | Constraint Rule / Validation Message |
|---|---|---|---|---|
| **`dcterms:title`** | Title / Display Name | `1..*` | `xsd:string` | Front End App must have a title. |
| **`robos:repository`** | Git Repository | `1..*` | `xsd:string` | Front End App must define a repository. |
| **`robos:technology`** | Technology Stack | `1..*` | `xsd:string` | Front End App must specify technology stack. |
| **`robos:frontendFramework`** | Frontend Framework | `1..*` | `xsd:string` | Front End App must declare frontend framework (React, Vue, Next.js, Angular, Svelte). |

---

## Canonical OSLC JSON-LD Example

```json
{
  "@id": "urn:robos:app:billing-portal",
  "@type": [
    "oslc_am:Resource",
    "robos:FrontEndApp"
  ],
  "dcterms:title": "Billing Web Portal",
  "robos:framework": "React 19 / Vite",
  "robos:package": "applications",
  "robos:namespace": "robos.applications",
  "robos:repository": "github.com/acme/billing-portal",
  "robos:technology": "React 19 / TypeScript / Vite",
  "robos:frontendFramework": "React"
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
        "@id": "urn:robos:app:billing-portal",
        "@type": [
            "oslc_am:Resource",
            "robos:FrontEndApp"
        ],
        "dcterms:title": "Billing Web Portal",
        "robos:framework": "React 19 / Vite",
        "robos:package": "applications",
        "robos:namespace": "robos.applications",
        "robos:repository": "github.com/acme/billing-portal",
        "robos:technology": "React 19 / TypeScript / Vite",
        "robos:frontendFramework": "React"
    }
  ],
}));

console.log("Conforms:", result.conforms); // Expected: true
```