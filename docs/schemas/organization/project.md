---
title: Project
layout: default
parent: Organization & Teams (robos.org)
grand_parent: KGraph Schemas
nav_order: 2
permalink: /schemas/organization/project.html
---

# Schema: `robos:Project`
{: .no_toc }

Formal W3C SHACL constraint shape and OSLC JSON-LD specification for `robos:Project` in the `organization` package store.
{: .fs-6 .fw-300 }

## Table of contents
{: .no_toc .text-delta }

1. TOC
{:toc}

---

## Specification Metadata

- **RDF / OWL Class**: `robos:Project`
- **Aliases / Target Classes**: `robos:Project`
- **SHACL Shape ID**: `urn:robos:shape:ProjectShape`
- **Governing Package**: [Organization & Teams (robos.org)]({{ '/schemas/organization.html' | relative_url }}) (`organization`)
- **Namespace**: `robos.org`
- **Schema.org Classification**: [https://schema.org/Project](https://schema.org/Project)
- **Domain De Facto Standard**: [https://schema.org/Project](https://schema.org/Project)
- **Upstream Schema Basis (Refers From)**: [https://schema.org/Project](https://schema.org/Project)

---

## Upstream Schema Basis (Refers From) & Global Standards Provenance

This RobOS schema is modeled after and directly aligns with two levels of global standards:
- **Universal Schema.org Class**: [https://schema.org/Project](https://schema.org/Project) (100% interoperability with search engines, web indexers, and general AI reasoning)
- **Specialized Domain Standard**: [https://schema.org/Project](https://schema.org/Project) (de facto standard for domain-specific ALM, BDD, or infrastructure operations)
- **Canonical Reference**: [https://schema.org/Project](https://schema.org/Project)
- **Agent Guidelines**: When autonomous agents generate, expand, or validate instances of `robos:Project`, they MUST adhere to and base their output on this referred schema object and universal Schema.org parent class, extending it with RobOS SDLC properties.

---

## Entity Relationship & Schema Context

<div style="margin: 1.5rem 0; padding: 1.25rem; background: #161b22; border: 1px solid #30363d; border-radius: 8px;">
  <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.75rem; flex-wrap: wrap; gap: 0.5rem;">
    <span style="font-size: 1.15rem; font-weight: 700; color: #38bdf8;">Project</span>
    <span style="font-family: monospace; background: #121927; color: #00e5ff; border: 1px solid rgba(0, 229, 255, 0.4); padding: 0.2rem 0.6rem; border-radius: 6px; font-size: 0.85rem;">robos:Project</span>
  </div>
  <p style="margin-bottom: 0.75rem; font-size: 0.92rem; color: #c9d1d9;">Governed by W3C SHACL shape <code>urn:robos:shape:ProjectShape</code> within the <strong>Organization & Teams (robos.org)</strong> (<code>robos.org</code>) package store.</p>
  <div style="display: flex; flex-wrap: wrap; gap: 0.5rem; margin-top: 0.5rem;">
    <span style="background: #0d1117; border: 1px solid #21262d; padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.8rem; color: #8b949e;"><code>dcterms:title</code></span>
    <span style="background: #0d1117; border: 1px solid #21262d; padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.8rem; color: #8b949e;"><code>robos:status</code></span>
  </div>
</div>

---

**RobOS classification:** Projects & work items. These RobOS-owned codes use Schema.org CategoryCode vocabulary.

## Property Constraints & SHACL Rules

| Property Path | Name | Multiplicity | Data Type | Classification | Constraint Rule / Validation Message |
|---|---|---|---|---|---|
| **`dcterms:title`** | Title / Display Name | `1..*` | `xsd:string` | Services & processing, Applications & entry points, Contracts & data models, Data stores & messaging, Libraries & build systems, Infrastructure & delivery, Organization & people, Projects & work items, Source control & artifacts, Agents & MCP, Documentation & decisions, Learning & assessment, Testing & behavior | Project must have a title / name. |
| **`robos:status`** | Lifecycle Status | `1..*` | `xsd:string` | Projects & work items, Source control & artifacts, Documentation & decisions | Project must declare a lifecycle status. |

---

## Canonical OSLC JSON-LD Example

```json
{
  "@id": "urn:robos:organization:project-sample",
  "@type": [
    "robos:Project",
    "schema:Project",
    "oslc:Resource"
  ],
  "dcterms:title": "Sample Project",
  "dcterms:description": "Canonical reference instance for robos:Project.",
  "robos:package": "organization",
  "robos:namespace": "robos.org",
  "robos:status": "active",
  "robos:schemaOrgType": "https://schema.org/Project",
  "robos:domainStandard": "https://schema.org/Project",
  "robos:refersFrom": "https://schema.org/Project"
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
        "@id": "urn:robos:organization:project-sample",
        "@type": [
            "robos:Project",
            "schema:Project",
            "oslc:Resource"
        ],
        "dcterms:title": "Sample Project",
        "dcterms:description": "Canonical reference instance for robos:Project.",
        "robos:package": "organization",
        "robos:namespace": "robos.org",
        "robos:status": "active",
        "robos:schemaOrgType": "https://schema.org/Project",
        "robos:domainStandard": "https://schema.org/Project",
        "robos:refersFrom": "https://schema.org/Project"
    }
  ],
}));

console.log("Conforms:", result.conforms); // Expected: true
```