---
title: Data Model
layout: default
parent: Services & Contracts (robos.services)
grand_parent: KGraph Schemas
nav_order: 8
permalink: /schemas/services/data-model.html
---

# Schema: `robos:DataModel`
{: .no_toc }

Formal W3C SHACL constraint shape and OSLC JSON-LD specification for `robos:DataModel` in the `services` package store.
{: .fs-6 .fw-300 }

## Table of contents
{: .no_toc .text-delta }

1. TOC
{:toc}

---

## Specification Metadata

- **RDF / OWL Class**: `robos:DataModel`
- **Aliases / Target Classes**: `robos:DataModel`, `robos:SchemaModel`, `robos:DomainEntity`
- **SHACL Shape ID**: `urn:robos:shape:DataModelShape`
- **Governing Package**: [Services & Contracts (robos.services)]({{ '/schemas/services.html' | relative_url }}) (`services`)
- **Namespace**: `robos.services`
- **Schema.org Classification**: [https://schema.org/Class](https://schema.org/Class)
- **Domain De Facto Standard**: [https://spec.openapis.org/oas/v3.1.0](https://spec.openapis.org/oas/v3.1.0)
- **Upstream Schema Basis (Refers From)**: [https://schema.org/Class](https://schema.org/Class)

---

## Upstream Schema Basis (Refers From) & Global Standards Provenance

This RobOS schema is modeled after and directly aligns with two levels of global standards:
- **Universal Schema.org Class**: [https://schema.org/Class](https://schema.org/Class) (100% interoperability with search engines, web indexers, and general AI reasoning)
- **Specialized Domain Standard**: [https://spec.openapis.org/oas/v3.1.0](https://spec.openapis.org/oas/v3.1.0) (de facto standard for domain-specific ALM, BDD, or infrastructure operations)
- **Canonical Reference**: [https://schema.org/Class](https://schema.org/Class)
- **Agent Guidelines**: When autonomous agents generate, expand, or validate instances of `robos:DataModel`, they MUST adhere to and base their output on this referred schema object and universal Schema.org parent class, extending it with RobOS SDLC properties.

---

## Entity Relationship & Schema Context

<div style="margin: 1.5rem 0; padding: 1.25rem; background: #161b22; border: 1px solid #30363d; border-radius: 8px;">
  <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.75rem; flex-wrap: wrap; gap: 0.5rem;">
    <span style="font-size: 1.15rem; font-weight: 700; color: #38bdf8;">Data Model</span>
    <span style="font-family: monospace; background: #121927; color: #00e5ff; border: 1px solid rgba(0, 229, 255, 0.4); padding: 0.2rem 0.6rem; border-radius: 6px; font-size: 0.85rem;">robos:DataModel</span>
  </div>
  <p style="margin-bottom: 0.75rem; font-size: 0.92rem; color: #c9d1d9;">Governed by W3C SHACL shape <code>urn:robos:shape:DataModelShape</code> within the <strong>Services & Contracts (robos.services)</strong> (<code>robos.services</code>) package store.</p>
  <div style="display: flex; flex-wrap: wrap; gap: 0.5rem; margin-top: 0.5rem;">
    <span style="background: #0d1117; border: 1px solid #21262d; padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.8rem; color: #8b949e;"><code>dcterms:title</code></span>
    <span style="background: #0d1117; border: 1px solid #21262d; padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.8rem; color: #8b949e;"><code>robos:modelName</code></span>
  </div>
</div>

---

## Property Constraints & SHACL Rules

| Property Path | Name | Multiplicity | Data Type | Constraint Rule / Validation Message |
|---|---|---|---|---|
| **`dcterms:title`** | Title / Display Name | `1..*` | `xsd:string` | Data Model must have a title. |
| **`robos:modelName`** | Data Model Name | `1..*` | `xsd:string` | Data Model must specify entity/model name. |

---

## Canonical OSLC JSON-LD Example

```json
{
  "@id": "urn:robos:services:data-model-sample",
  "@type": [
    "robos:DataModel",
    "robos:SchemaModel",
    "robos:DomainEntity",
    "schema:Class",
    "oslc:Resource"
  ],
  "dcterms:title": "Sample Data Model",
  "dcterms:description": "Canonical reference instance for robos:DataModel.",
  "robos:package": "services",
  "robos:namespace": "robos.services",
  "robos:modelName": "SampleModel",
  "robos:schemaOrgType": "https://schema.org/Class",
  "robos:domainStandard": "https://spec.openapis.org/oas/v3.1.0",
  "robos:refersFrom": "https://schema.org/Class"
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
        "@id": "urn:robos:services:data-model-sample",
        "@type": [
            "robos:DataModel",
            "robos:SchemaModel",
            "robos:DomainEntity",
            "schema:Class",
            "oslc:Resource"
        ],
        "dcterms:title": "Sample Data Model",
        "dcterms:description": "Canonical reference instance for robos:DataModel.",
        "robos:package": "services",
        "robos:namespace": "robos.services",
        "robos:modelName": "SampleModel",
        "robos:schemaOrgType": "https://schema.org/Class",
        "robos:domainStandard": "https://spec.openapis.org/oas/v3.1.0",
        "robos:refersFrom": "https://schema.org/Class"
    }
  ],
}));

console.log("Conforms:", result.conforms); // Expected: true
```