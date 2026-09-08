---
title: Subtask
layout: default
parent: Organization & Teams (robos.org)
grand_parent: KGraph Schemas
nav_order: 9
permalink: /schemas/organization/subtask.html
---

# Schema: `robos:Subtask`
{: .no_toc }

Formal W3C SHACL constraint shape and OSLC JSON-LD specification for `robos:Subtask` in the `organization` package store.
{: .fs-6 .fw-300 }

## Table of contents
{: .no_toc .text-delta }

1. TOC
{:toc}

---

## Specification Metadata

- **RDF / OWL Class**: `robos:Subtask`
- **Aliases / Target Classes**: `robos:Subtask`
- **SHACL Shape ID**: `urn:robos:shape:SubtaskShape`
- **Governing Package**: [Organization & Teams (robos.org)]({{ '/schemas/organization.html' | relative_url }}) (`organization`)
- **Namespace**: `robos.org`
- **Schema.org Classification**: [https://schema.org/Action](https://schema.org/Action)
- **Domain De Facto Standard**: [http://open-services.net/ns/cm#ChangeRequest](http://open-services.net/ns/cm#ChangeRequest)
- **Upstream Schema Basis (Refers From)**: [http://open-services.net/ns/cm#ChangeRequest](http://open-services.net/ns/cm#ChangeRequest)

---

## Upstream Schema Basis (Refers From) & Global Standards Provenance

This RobOS schema is modeled after and directly aligns with two levels of global standards:
- **Universal Schema.org Class**: [https://schema.org/Action](https://schema.org/Action) (100% interoperability with search engines, web indexers, and general AI reasoning)
- **Specialized Domain Standard**: [http://open-services.net/ns/cm#ChangeRequest](http://open-services.net/ns/cm#ChangeRequest) (de facto standard for domain-specific ALM, BDD, or infrastructure operations)
- **Canonical Reference**: [http://open-services.net/ns/cm#ChangeRequest](http://open-services.net/ns/cm#ChangeRequest)
- **Agent Guidelines**: When autonomous agents generate, expand, or validate instances of `robos:Subtask`, they MUST adhere to and base their output on this referred schema object and universal Schema.org parent class, extending it with RobOS SDLC properties.

---

## Entity Relationship & Schema Context

<div style="margin: 1.5rem 0; padding: 1.25rem; background: #161b22; border: 1px solid #30363d; border-radius: 8px;">
  <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.75rem; flex-wrap: wrap; gap: 0.5rem;">
    <span style="font-size: 1.15rem; font-weight: 700; color: #38bdf8;">Subtask</span>
    <span style="font-family: monospace; background: #121927; color: #00e5ff; border: 1px solid rgba(0, 229, 255, 0.4); padding: 0.2rem 0.6rem; border-radius: 6px; font-size: 0.85rem;">robos:Subtask</span>
  </div>
  <p style="margin-bottom: 0.75rem; font-size: 0.92rem; color: #c9d1d9;">Governed by W3C SHACL shape <code>urn:robos:shape:SubtaskShape</code> within the <strong>Organization & Teams (robos.org)</strong> (<code>robos.org</code>) package store.</p>
  <div style="display: flex; flex-wrap: wrap; gap: 0.5rem; margin-top: 0.5rem;">
    <span style="background: #0d1117; border: 1px solid #21262d; padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.8rem; color: #8b949e;"><code>dcterms:title</code></span>
    <span style="background: #0d1117; border: 1px solid #21262d; padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.8rem; color: #8b949e;"><code>robos:parentTask</code></span>
  </div>
</div>

---

## Property Constraints & SHACL Rules

| Property Path | Name | Multiplicity | Data Type | Constraint Rule / Validation Message |
|---|---|---|---|---|
| **`dcterms:title`** | Title / Display Name | `1..*` | `xsd:string` | Subtask must have a title. |
| **`robos:parentTask`** | Parent Task | `1..*` | `URI (robos:Task)` | Subtask must link to its parent task. |

---

## Canonical OSLC JSON-LD Example

```json
{
  "@id": "urn:robos:organization:subtask-sample",
  "@type": [
    "robos:Subtask",
    "schema:Action",
    "oslc:Resource"
  ],
  "dcterms:title": "Sample Subtask",
  "dcterms:description": "Canonical reference instance for robos:Subtask.",
  "robos:package": "organization",
  "robos:namespace": "robos.org",
  "robos:parentTask": "urn:robos:task:sample-task-1",
  "robos:schemaOrgType": "https://schema.org/Action",
  "robos:domainStandard": "http://open-services.net/ns/cm#ChangeRequest",
  "robos:refersFrom": "http://open-services.net/ns/cm#ChangeRequest"
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
        "@id": "urn:robos:organization:subtask-sample",
        "@type": [
            "robos:Subtask",
            "schema:Action",
            "oslc:Resource"
        ],
        "dcterms:title": "Sample Subtask",
        "dcterms:description": "Canonical reference instance for robos:Subtask.",
        "robos:package": "organization",
        "robos:namespace": "robos.org",
        "robos:parentTask": "urn:robos:task:sample-task-1",
        "robos:schemaOrgType": "https://schema.org/Action",
        "robos:domainStandard": "http://open-services.net/ns/cm#ChangeRequest",
        "robos:refersFrom": "http://open-services.net/ns/cm#ChangeRequest"
    }
  ],
}));

console.log("Conforms:", result.conforms); // Expected: true
```