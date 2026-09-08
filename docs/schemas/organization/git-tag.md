---
title: Git Tag
layout: default
parent: Organization & Teams (robos.org)
grand_parent: KGraph Schemas
nav_order: 17
permalink: /schemas/organization/git-tag.html
---

# Schema: `robos:GitTag`
{: .no_toc }

Formal W3C SHACL constraint shape and OSLC JSON-LD specification for `robos:GitTag` in the `organization` package store.
{: .fs-6 .fw-300 }

## Table of contents
{: .no_toc .text-delta }

1. TOC
{:toc}

---

## Specification Metadata

- **RDF / OWL Class**: `robos:GitTag`
- **Aliases / Target Classes**: `robos:GitTag`
- **SHACL Shape ID**: `urn:robos:shape:GitTagShape`
- **Governing Package**: [Organization & Teams (robos.org)]({{ '/schemas/organization.html' | relative_url }}) (`organization`)
- **Namespace**: `robos.org`
- **Schema.org Classification**: [https://schema.org/SoftwareSourceCode](https://schema.org/SoftwareSourceCode)
- **Domain De Facto Standard**: [https://schema.org/SoftwareSourceCode](https://schema.org/SoftwareSourceCode)
- **Upstream Schema Basis (Refers From)**: [https://schema.org/SoftwareSourceCode](https://schema.org/SoftwareSourceCode)

---

## Upstream Schema Basis (Refers From) & Global Standards Provenance

This RobOS schema is modeled after and directly aligns with two levels of global standards:
- **Universal Schema.org Class**: [https://schema.org/SoftwareSourceCode](https://schema.org/SoftwareSourceCode) (100% interoperability with search engines, web indexers, and general AI reasoning)
- **Specialized Domain Standard**: [https://schema.org/SoftwareSourceCode](https://schema.org/SoftwareSourceCode) (de facto standard for domain-specific ALM, BDD, or infrastructure operations)
- **Canonical Reference**: [https://schema.org/SoftwareSourceCode](https://schema.org/SoftwareSourceCode)
- **Agent Guidelines**: When autonomous agents generate, expand, or validate instances of `robos:GitTag`, they MUST adhere to and base their output on this referred schema object and universal Schema.org parent class, extending it with RobOS SDLC properties.

---

## Entity Relationship & Schema Context

<div style="margin: 1.5rem 0; padding: 1.25rem; background: #161b22; border: 1px solid #30363d; border-radius: 8px;">
  <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.75rem; flex-wrap: wrap; gap: 0.5rem;">
    <span style="font-size: 1.15rem; font-weight: 700; color: #38bdf8;">Git Tag</span>
    <span style="font-family: monospace; background: #121927; color: #00e5ff; border: 1px solid rgba(0, 229, 255, 0.4); padding: 0.2rem 0.6rem; border-radius: 6px; font-size: 0.85rem;">robos:GitTag</span>
  </div>
  <p style="margin-bottom: 0.75rem; font-size: 0.92rem; color: #c9d1d9;">Governed by W3C SHACL shape <code>urn:robos:shape:GitTagShape</code> within the <strong>Organization & Teams (robos.org)</strong> (<code>robos.org</code>) package store.</p>
  <div style="display: flex; flex-wrap: wrap; gap: 0.5rem; margin-top: 0.5rem;">
    <span style="background: #0d1117; border: 1px solid #21262d; padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.8rem; color: #8b949e;"><code>dcterms:title</code></span>
    <span style="background: #0d1117; border: 1px solid #21262d; padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.8rem; color: #8b949e;"><code>robos:tagName</code></span>
    <span style="background: #0d1117; border: 1px solid #21262d; padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.8rem; color: #8b949e;"><code>robos:commitSha</code></span>
  </div>
</div>

---

## Property Constraints & SHACL Rules

| Property Path | Name | Multiplicity | Data Type | Constraint Rule / Validation Message |
|---|---|---|---|---|
| **`dcterms:title`** | Title / Display Name | `1..*` | `xsd:string` | Git Tag must have a title. |
| **`robos:tagName`** | Git Release Tag | `1..*` | `xsd:string` | Git Tag must specify tag name. |
| **`robos:commitSha`** | Git Commit SHA | `1..*` | `xsd:string` | Git Tag must link to target commit SHA. |

---

## Canonical OSLC JSON-LD Example

```json
{
  "@id": "urn:robos:organization:git-tag-sample",
  "@type": [
    "robos:GitTag",
    "schema:SoftwareSourceCode",
    "oslc:Resource"
  ],
  "dcterms:title": "Sample Git Tag",
  "dcterms:description": "Canonical reference instance for robos:GitTag.",
  "robos:package": "organization",
  "robos:namespace": "robos.org",
  "robos:tagName": "v1.0.0",
  "robos:commitSha": "4a8f9c1b2e3d4f5a6b7c8d9e0f1a2b3c4d5e6f7a",
  "robos:schemaOrgType": "https://schema.org/SoftwareSourceCode",
  "robos:domainStandard": "https://schema.org/SoftwareSourceCode",
  "robos:refersFrom": "https://schema.org/SoftwareSourceCode"
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
        "@id": "urn:robos:organization:git-tag-sample",
        "@type": [
            "robos:GitTag",
            "schema:SoftwareSourceCode",
            "oslc:Resource"
        ],
        "dcterms:title": "Sample Git Tag",
        "dcterms:description": "Canonical reference instance for robos:GitTag.",
        "robos:package": "organization",
        "robos:namespace": "robos.org",
        "robos:tagName": "v1.0.0",
        "robos:commitSha": "4a8f9c1b2e3d4f5a6b7c8d9e0f1a2b3c4d5e6f7a",
        "robos:schemaOrgType": "https://schema.org/SoftwareSourceCode",
        "robos:domainStandard": "https://schema.org/SoftwareSourceCode",
        "robos:refersFrom": "https://schema.org/SoftwareSourceCode"
    }
  ],
}));

console.log("Conforms:", result.conforms); // Expected: true
```