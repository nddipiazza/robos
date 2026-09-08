---
title: Web Route
layout: default
parent: Applications (robos.apps)
grand_parent: KGraph Schemas
nav_order: 8
permalink: /schemas/applications/web-route.html
---

# Schema: `robos:WebRoute`
{: .no_toc }

Formal W3C SHACL constraint shape and OSLC JSON-LD specification for `robos:WebRoute` in the `applications` package store.
{: .fs-6 .fw-300 }

## Table of contents
{: .no_toc .text-delta }

1. TOC
{:toc}

---

## Specification Metadata

- **RDF / OWL Class**: `robos:WebRoute`
- **Aliases / Target Classes**: `robos:WebRoute`
- **SHACL Shape ID**: `urn:robos:shape:WebRouteShape`
- **Governing Package**: [Applications (robos.apps)]({{ '/schemas/applications.html' | relative_url }}) (`applications`)
- **Namespace**: `robos.apps`

---

## Entity Relationship & Schema Context

<div style="margin: 1.5rem 0; padding: 1.25rem; background: #161b22; border: 1px solid #30363d; border-radius: 8px;">
  <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.75rem; flex-wrap: wrap; gap: 0.5rem;">
    <span style="font-size: 1.15rem; font-weight: 700; color: #38bdf8;">Web Route</span>
    <span style="font-family: monospace; background: #121927; color: #00e5ff; border: 1px solid rgba(0, 229, 255, 0.4); padding: 0.2rem 0.6rem; border-radius: 6px; font-size: 0.85rem;">robos:WebRoute</span>
  </div>
  <p style="margin-bottom: 0.75rem; font-size: 0.92rem; color: #c9d1d9;">Governed by W3C SHACL shape <code>urn:robos:shape:WebRouteShape</code> within the <strong>Applications (robos.apps)</strong> (<code>robos.apps</code>) package store.</p>
  <div style="display: flex; flex-wrap: wrap; gap: 0.5rem; margin-top: 0.5rem;">
    <span style="background: #0d1117; border: 1px solid #21262d; padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.8rem; color: #8b949e;"><code>dcterms:title</code></span>
    <span style="background: #0d1117; border: 1px solid #21262d; padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.8rem; color: #8b949e;"><code>robos:routePath</code></span>
    <span style="background: #0d1117; border: 1px solid #21262d; padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.8rem; color: #8b949e;"><code>robos:app</code></span>
  </div>
</div>

---

## Property Constraints & SHACL Rules

| Property Path | Name | Multiplicity | Data Type | Constraint Rule / Validation Message |
|---|---|---|---|---|
| **`dcterms:title`** | Title / Display Name | `1..*` | `xsd:string` | Web Route must have a title. |
| **`robos:routePath`** | Web Route Path | `1..*` | `xsd:string` | Web Route must specify route path (e.g. /dashboard). |
| **`robos:app`** | Parent Application | `1..*` | `URI (robos:FrontEndApp | robos:DesktopApp | robos:ConsoleApp)` | Web Route must link to parent application. |

---

## Canonical OSLC JSON-LD Example

```json
{
  "@id": "urn:robos:applications:web-route-sample",
  "@type": [
    "robos:WebRoute",
    "oslc:Resource"
  ],
  "dcterms:title": "Sample Web Route",
  "dcterms:description": "Canonical reference instance for robos:WebRoute.",
  "robos:package": "applications",
  "robos:namespace": "robos.apps",
  "robos:routePath": "/dashboard",
  "robos:app": "urn:robos:app:dev-central"
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
        "@id": "urn:robos:applications:web-route-sample",
        "@type": [
            "robos:WebRoute",
            "oslc:Resource"
        ],
        "dcterms:title": "Sample Web Route",
        "dcterms:description": "Canonical reference instance for robos:WebRoute.",
        "robos:package": "applications",
        "robos:namespace": "robos.apps",
        "robos:routePath": "/dashboard",
        "robos:app": "urn:robos:app:dev-central"
    }
  ],
}));

console.log("Conforms:", result.conforms); // Expected: true
```