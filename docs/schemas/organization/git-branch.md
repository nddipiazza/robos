---
title: Git Branch
layout: default
parent: Organization & Teams (robos.org)
grand_parent: KGraph Schemas
nav_order: 14
permalink: /schemas/organization/git-branch.html
---

# Schema: `robos:GitBranch`
{: .no_toc }

Formal W3C SHACL constraint shape and OSLC JSON-LD specification for `robos:GitBranch` in the `organization` package store.
{: .fs-6 .fw-300 }

## Table of contents
{: .no_toc .text-delta }

1. TOC
{:toc}

---

## Specification Metadata

- **RDF / OWL Class**: `robos:GitBranch`
- **Aliases / Target Classes**: `robos:GitBranch`
- **SHACL Shape ID**: `urn:robos:shape:GitBranchShape`
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
- **Agent Guidelines**: When autonomous agents generate, expand, or validate instances of `robos:GitBranch`, they MUST adhere to and base their output on this referred schema object and universal Schema.org parent class, extending it with RobOS SDLC properties.

---

## Entity Relationship & Schema Context

<div style="margin: 1.5rem 0; padding: 1.25rem; background: #161b22; border: 1px solid #30363d; border-radius: 8px;">
  <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.75rem; flex-wrap: wrap; gap: 0.5rem;">
    <span style="font-size: 1.15rem; font-weight: 700; color: #38bdf8;">Git Branch</span>
    <span style="font-family: monospace; background: #121927; color: #00e5ff; border: 1px solid rgba(0, 229, 255, 0.4); padding: 0.2rem 0.6rem; border-radius: 6px; font-size: 0.85rem;">robos:GitBranch</span>
  </div>
  <p style="margin-bottom: 0.75rem; font-size: 0.92rem; color: #c9d1d9;">Governed by W3C SHACL shape <code>urn:robos:shape:GitBranchShape</code> within the <strong>Organization & Teams (robos.org)</strong> (<code>robos.org</code>) package store.</p>
  <div style="display: flex; flex-wrap: wrap; gap: 0.5rem; margin-top: 0.5rem;">
    <span style="background: #0d1117; border: 1px solid #21262d; padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.8rem; color: #8b949e;"><code>dcterms:title</code></span>
    <span style="background: #0d1117; border: 1px solid #21262d; padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.8rem; color: #8b949e;"><code>robos:branchName</code></span>
    <span style="background: #0d1117; border: 1px solid #21262d; padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.8rem; color: #8b949e;"><code>robos:repository</code></span>
  </div>
</div>

---

**RobOS classification:** Source control & artifacts. These RobOS-owned codes use Schema.org CategoryCode vocabulary.

## Property Constraints & SHACL Rules

| Property Path | Name | Multiplicity | Data Type | Classification | Constraint Rule / Validation Message |
|---|---|---|---|---|---|
| **`dcterms:title`** | Title / Display Name | `1..*` | `xsd:string` | Services & processing, Applications & entry points, Contracts & data models, Data stores & messaging, Libraries & build systems, Infrastructure & delivery, Organization & people, Projects & work items, Source control & artifacts, Agents & MCP, Documentation & decisions, Learning & assessment, Testing & behavior | Git Branch must have a title or display name. |
| **`robos:branchName`** | Git Branch Name | `1..*` | `xsd:string` | Source control & artifacts | Git Branch must specify branch name. |
| **`robos:repository`** | Git Repository | `1..*` | `xsd:string` | Services & processing, Applications & entry points, Libraries & build systems, Source control & artifacts | Git Branch must link to parent repository. |

---

## Canonical OSLC JSON-LD Example

```json
{
  "@id": "urn:robos:organization:git-branch-sample",
  "@type": [
    "robos:GitBranch",
    "schema:SoftwareSourceCode",
    "oslc:Resource"
  ],
  "dcterms:title": "Sample Git Branch",
  "dcterms:description": "Canonical reference instance for robos:GitBranch.",
  "robos:package": "organization",
  "robos:namespace": "robos.org",
  "robos:branchName": "feat/new-feature",
  "robos:repository": "github.com/acme/sample-repo",
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
        "@id": "urn:robos:organization:git-branch-sample",
        "@type": [
            "robos:GitBranch",
            "schema:SoftwareSourceCode",
            "oslc:Resource"
        ],
        "dcterms:title": "Sample Git Branch",
        "dcterms:description": "Canonical reference instance for robos:GitBranch.",
        "robos:package": "organization",
        "robos:namespace": "robos.org",
        "robos:branchName": "feat/new-feature",
        "robos:repository": "github.com/acme/sample-repo",
        "robos:schemaOrgType": "https://schema.org/SoftwareSourceCode",
        "robos:domainStandard": "https://schema.org/SoftwareSourceCode",
        "robos:refersFrom": "https://schema.org/SoftwareSourceCode"
    }
  ],
}));

console.log("Conforms:", result.conforms); // Expected: true
```