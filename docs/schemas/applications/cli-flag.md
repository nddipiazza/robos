---
title: CLI Flag
layout: default
parent: Applications (robos.apps)
grand_parent: KGraph Schemas
nav_order: 10
permalink: /schemas/applications/cli-flag.html
---

# Schema: `robos:CLIFlag`
{: .no_toc }

Formal W3C SHACL constraint shape and OSLC JSON-LD specification for `robos:CLIFlag` in the `applications` package store.
{: .fs-6 .fw-300 }

## Table of contents
{: .no_toc .text-delta }

1. TOC
{:toc}

---

## Specification Metadata

- **RDF / OWL Class**: `robos:CLIFlag`
- **Aliases / Target Classes**: `robos:CLIFlag`
- **SHACL Shape ID**: `urn:robos:shape:CLIFlagShape`
- **Governing Package**: [Applications (robos.apps)]({{ '/schemas/applications.html' | relative_url }}) (`applications`)
- **Namespace**: `robos.apps`
- **Schema.org Classification**: [https://schema.org/PropertyValue](https://schema.org/PropertyValue)
- **Domain De Facto Standard**: [https://schema.org/PropertyValue](https://schema.org/PropertyValue)
- **Upstream Schema Basis (Refers From)**: [https://schema.org/PropertyValue](https://schema.org/PropertyValue)

---

## Upstream Schema Basis (Refers From) & Global Standards Provenance

This RobOS schema is modeled after and directly aligns with two levels of global standards:
- **Universal Schema.org Class**: [https://schema.org/PropertyValue](https://schema.org/PropertyValue) (100% interoperability with search engines, web indexers, and general AI reasoning)
- **Specialized Domain Standard**: [https://schema.org/PropertyValue](https://schema.org/PropertyValue) (de facto standard for domain-specific ALM, BDD, or infrastructure operations)
- **Canonical Reference**: [https://schema.org/PropertyValue](https://schema.org/PropertyValue)
- **Agent Guidelines**: When autonomous agents generate, expand, or validate instances of `robos:CLIFlag`, they MUST adhere to and base their output on this referred schema object and universal Schema.org parent class, extending it with RobOS SDLC properties.

---

## Entity Relationship & Schema Context

<div style="margin: 1.5rem 0; padding: 1.25rem; background: #161b22; border: 1px solid #30363d; border-radius: 8px;">
  <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.75rem; flex-wrap: wrap; gap: 0.5rem;">
    <span style="font-size: 1.15rem; font-weight: 700; color: #38bdf8;">CLI Flag</span>
    <span style="font-family: monospace; background: #121927; color: #00e5ff; border: 1px solid rgba(0, 229, 255, 0.4); padding: 0.2rem 0.6rem; border-radius: 6px; font-size: 0.85rem;">robos:CLIFlag</span>
  </div>
  <p style="margin-bottom: 0.75rem; font-size: 0.92rem; color: #c9d1d9;">Governed by W3C SHACL shape <code>urn:robos:shape:CLIFlagShape</code> within the <strong>Applications (robos.apps)</strong> (<code>robos.apps</code>) package store.</p>
  <div style="display: flex; flex-wrap: wrap; gap: 0.5rem; margin-top: 0.5rem;">
    <span style="background: #0d1117; border: 1px solid #21262d; padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.8rem; color: #8b949e;"><code>dcterms:title</code></span>
    <span style="background: #0d1117; border: 1px solid #21262d; padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.8rem; color: #8b949e;"><code>robos:flagName</code></span>
    <span style="background: #0d1117; border: 1px solid #21262d; padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.8rem; color: #8b949e;"><code>robos:command</code></span>
  </div>
</div>

---

**RobOS classification:** Applications & entry points. These RobOS-owned codes use Schema.org CategoryCode vocabulary.

## Property Constraints & SHACL Rules

| Property Path | Name | Multiplicity | Data Type | Classification | Constraint Rule / Validation Message |
|---|---|---|---|---|---|
| **`dcterms:title`** | Title / Display Name | `1..*` | `xsd:string` | Services & processing, Applications & entry points, Contracts & data models, Data stores & messaging, Libraries & build systems, Infrastructure & delivery, Organization & people, Projects & work items, Source control & artifacts, Agents & MCP, Documentation & decisions, Learning & assessment, Testing & behavior | CLI Flag must have a title. |
| **`robos:flagName`** | CLI Flag / Option Name | `1..*` | `xsd:string` | Applications & entry points | CLI Flag must declare flag name (e.g. --output). |
| **`robos:command`** | Parent CLI Command | `1..*` | `URI (robos:CLICommand)` | Applications & entry points | CLI Flag must link to parent CLI command. |

---

## Canonical OSLC JSON-LD Example

```json
{
  "@id": "urn:robos:applications:cli-flag-sample",
  "@type": [
    "robos:CLIFlag",
    "schema:PropertyValue",
    "oslc:Resource"
  ],
  "dcterms:title": "Sample CLI Flag",
  "dcterms:description": "Canonical reference instance for robos:CLIFlag.",
  "robos:package": "applications",
  "robos:namespace": "robos.apps",
  "robos:flagName": "--output",
  "robos:command": "urn:robos:cli:validate",
  "robos:schemaOrgType": "https://schema.org/PropertyValue",
  "robos:domainStandard": "https://schema.org/PropertyValue",
  "robos:refersFrom": "https://schema.org/PropertyValue"
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
        "@id": "urn:robos:applications:cli-flag-sample",
        "@type": [
            "robos:CLIFlag",
            "schema:PropertyValue",
            "oslc:Resource"
        ],
        "dcterms:title": "Sample CLI Flag",
        "dcterms:description": "Canonical reference instance for robos:CLIFlag.",
        "robos:package": "applications",
        "robos:namespace": "robos.apps",
        "robos:flagName": "--output",
        "robos:command": "urn:robos:cli:validate",
        "robos:schemaOrgType": "https://schema.org/PropertyValue",
        "robos:domainStandard": "https://schema.org/PropertyValue",
        "robos:refersFrom": "https://schema.org/PropertyValue"
    }
  ],
}));

console.log("Conforms:", result.conforms); // Expected: true
```