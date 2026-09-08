---
title: Git Repository
layout: default
parent: Organization & Teams (robos.org)
grand_parent: KGraph Schemas
nav_order: 13
permalink: /schemas/organization/git-repository.html
---

# Schema: `robos:GitRepository`
{: .no_toc }

Formal W3C SHACL constraint shape and OSLC JSON-LD specification for `robos:GitRepository` in the `organization` package store.
{: .fs-6 .fw-300 }

## Table of contents
{: .no_toc .text-delta }

1. TOC
{:toc}

---

## Specification Metadata

- **RDF / OWL Class**: `robos:GitRepository`
- **Aliases / Target Classes**: `robos:GitRepository`, `robos:Repository`
- **SHACL Shape ID**: `urn:robos:shape:GitRepositoryShape`
- **Governing Package**: [Organization & Teams (robos.org)]({{ '/schemas/organization.html' | relative_url }}) (`organization`)
- **Namespace**: `robos.org`

---

## Entity Relationship & Schema Context

<div style="margin: 1.5rem 0; padding: 1.25rem; background: #161b22; border: 1px solid #30363d; border-radius: 8px;">
  <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.75rem; flex-wrap: wrap; gap: 0.5rem;">
    <span style="font-size: 1.15rem; font-weight: 700; color: #38bdf8;">Git Repository</span>
    <span style="font-family: monospace; background: #121927; color: #00e5ff; border: 1px solid rgba(0, 229, 255, 0.4); padding: 0.2rem 0.6rem; border-radius: 6px; font-size: 0.85rem;">robos:GitRepository</span>
  </div>
  <p style="margin-bottom: 0.75rem; font-size: 0.92rem; color: #c9d1d9;">Governed by W3C SHACL shape <code>urn:robos:shape:GitRepositoryShape</code> within the <strong>Organization & Teams (robos.org)</strong> (<code>robos.org</code>) package store.</p>
  <div style="display: flex; flex-wrap: wrap; gap: 0.5rem; margin-top: 0.5rem;">
    <span style="background: #0d1117; border: 1px solid #21262d; padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.8rem; color: #8b949e;"><code>dcterms:title</code></span>
    <span style="background: #0d1117; border: 1px solid #21262d; padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.8rem; color: #8b949e;"><code>robos:url</code></span>
    <span style="background: #0d1117; border: 1px solid #21262d; padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.8rem; color: #8b949e;"><code>robos:defaultBranch</code></span>
  </div>
</div>

---

## Property Constraints & SHACL Rules

| Property Path | Name | Multiplicity | Data Type | Constraint Rule / Validation Message |
|---|---|---|---|---|
| **`dcterms:title`** | Title / Display Name | `1..*` | `xsd:string` | Git Repository must have a title. |
| **`robos:url`** | Forge / Web URL | `1..*` | `xsd:anyURI` | Git Repository must specify a repository URL. |
| **`robos:defaultBranch`** | Default Git Branch | `1..*` | `xsd:string` | Git Repository must declare its default branch. |

---

## Canonical OSLC JSON-LD Example

```json
{
  "@id": "urn:robos:organization:git-repository-sample",
  "@type": [
    "robos:GitRepository",
    "robos:Repository",
    "oslc:Resource"
  ],
  "dcterms:title": "Sample Git Repository",
  "dcterms:description": "Canonical reference instance for robos:GitRepository.",
  "robos:package": "organization",
  "robos:namespace": "robos.org",
  "robos:url": "https://github.com/acme",
  "robos:defaultBranch": "main"
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
        "@id": "urn:robos:organization:git-repository-sample",
        "@type": [
            "robos:GitRepository",
            "robos:Repository",
            "oslc:Resource"
        ],
        "dcterms:title": "Sample Git Repository",
        "dcterms:description": "Canonical reference instance for robos:GitRepository.",
        "robos:package": "organization",
        "robos:namespace": "robos.org",
        "robos:url": "https://github.com/acme",
        "robos:defaultBranch": "main"
    }
  ],
}));

console.log("Conforms:", result.conforms); // Expected: true
```