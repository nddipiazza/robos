---
title: Mobile App
layout: default
parent: Applications (robos.apps)
grand_parent: KGraph Schemas
nav_order: 3
permalink: /schemas/applications/mobile-app.html
---

# Schema: `robos:MobileApp`
{: .no_toc }

Formal W3C SHACL constraint shape and OSLC JSON-LD specification for `robos:MobileApp` in the `applications` package store.
{: .fs-6 .fw-300 }

## Table of contents
{: .no_toc .text-delta }

1. TOC
{:toc}

---

## Specification Metadata

- **RDF / OWL Class**: `robos:MobileApp`
- **Aliases / Target Classes**: `robos:MobileApp`
- **SHACL Shape ID**: `urn:robos:shape:MobileAppShape`
- **Governing Package**: [Applications (robos.apps)]({{ '/schemas/applications.html' | relative_url }}) (`applications`)
- **Namespace**: `robos.apps`
- **Schema.org Classification**: [https://schema.org/MobileApplication](https://schema.org/MobileApplication)
- **Domain De Facto Standard**: [https://schema.org/MobileApplication](https://schema.org/MobileApplication)
- **Upstream Schema Basis (Refers From)**: [https://schema.org/MobileApplication](https://schema.org/MobileApplication)

---

## Upstream Schema Basis (Refers From) & Global Standards Provenance

This RobOS schema is modeled after and directly aligns with two levels of global standards:
- **Universal Schema.org Class**: [https://schema.org/MobileApplication](https://schema.org/MobileApplication) (100% interoperability with search engines, web indexers, and general AI reasoning)
- **Specialized Domain Standard**: [https://schema.org/MobileApplication](https://schema.org/MobileApplication) (de facto standard for domain-specific ALM, BDD, or infrastructure operations)
- **Canonical Reference**: [https://schema.org/MobileApplication](https://schema.org/MobileApplication)
- **Agent Guidelines**: When autonomous agents generate, expand, or validate instances of `robos:MobileApp`, they MUST adhere to and base their output on this referred schema object and universal Schema.org parent class, extending it with RobOS SDLC properties.

---

## Entity Relationship & Schema Context

<div style="margin: 1.5rem 0; padding: 1.25rem; background: #161b22; border: 1px solid #30363d; border-radius: 8px;">
  <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.75rem; flex-wrap: wrap; gap: 0.5rem;">
    <span style="font-size: 1.15rem; font-weight: 700; color: #38bdf8;">Mobile App</span>
    <span style="font-family: monospace; background: #121927; color: #00e5ff; border: 1px solid rgba(0, 229, 255, 0.4); padding: 0.2rem 0.6rem; border-radius: 6px; font-size: 0.85rem;">robos:MobileApp</span>
  </div>
  <p style="margin-bottom: 0.75rem; font-size: 0.92rem; color: #c9d1d9;">Governed by W3C SHACL shape <code>urn:robos:shape:MobileAppShape</code> within the <strong>Applications (robos.apps)</strong> (<code>robos.apps</code>) package store.</p>
  <div style="display: flex; flex-wrap: wrap; gap: 0.5rem; margin-top: 0.5rem;">
    <span style="background: #0d1117; border: 1px solid #21262d; padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.8rem; color: #8b949e;"><code>dcterms:title</code></span>
    <span style="background: #0d1117; border: 1px solid #21262d; padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.8rem; color: #8b949e;"><code>robos:repository</code></span>
    <span style="background: #0d1117; border: 1px solid #21262d; padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.8rem; color: #8b949e;"><code>robos:technology</code></span>
    <span style="background: #0d1117; border: 1px solid #21262d; padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.8rem; color: #8b949e;"><code>robos:platform</code></span>
  </div>
</div>

---

## Property Constraints & SHACL Rules

| Property Path | Name | Multiplicity | Data Type | Constraint Rule / Validation Message |
|---|---|---|---|---|
| **`dcterms:title`** | Title / Display Name | `1..*` | `xsd:string` | Mobile App must have a title. |
| **`robos:repository`** | Git Repository | `1..*` | `xsd:string` | Mobile App must define a repository. |
| **`robos:technology`** | Technology Stack | `1..*` | `xsd:string` | Mobile App must specify technology stack. |
| **`robos:platform`** | Target Platform | `1..*` | `xsd:string` | Mobile App must specify mobile platform(s). |

---

## Canonical OSLC JSON-LD Example

```json
{
  "@id": "urn:robos:applications:mobile-app-sample",
  "@type": [
    "robos:MobileApp",
    "schema:MobileApplication",
    "oslc:Resource"
  ],
  "dcterms:title": "Sample Mobile App",
  "dcterms:description": "Canonical reference instance for robos:MobileApp.",
  "robos:package": "applications",
  "robos:namespace": "robos.apps",
  "robos:repository": "github.com/acme/sample-repo",
  "robos:technology": "Node.js / TypeScript",
  "robos:platform": "iOS / Android",
  "robos:schemaOrgType": "https://schema.org/MobileApplication",
  "robos:domainStandard": "https://schema.org/MobileApplication",
  "robos:refersFrom": "https://schema.org/MobileApplication"
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
        "@id": "urn:robos:applications:mobile-app-sample",
        "@type": [
            "robos:MobileApp",
            "schema:MobileApplication",
            "oslc:Resource"
        ],
        "dcterms:title": "Sample Mobile App",
        "dcterms:description": "Canonical reference instance for robos:MobileApp.",
        "robos:package": "applications",
        "robos:namespace": "robos.apps",
        "robos:repository": "github.com/acme/sample-repo",
        "robos:technology": "Node.js / TypeScript",
        "robos:platform": "iOS / Android",
        "robos:schemaOrgType": "https://schema.org/MobileApplication",
        "robos:domainStandard": "https://schema.org/MobileApplication",
        "robos:refersFrom": "https://schema.org/MobileApplication"
    }
  ],
}));

console.log("Conforms:", result.conforms); // Expected: true
```