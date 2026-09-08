---
title: Pull Request
layout: default
parent: Organization & Teams (robos.org)
grand_parent: KGraph Schemas
nav_order: 15
permalink: /schemas/organization/pull-request.html
---

# Schema: `robos:PullRequest`
{: .no_toc }

Formal W3C SHACL constraint shape and OSLC JSON-LD specification for `robos:PullRequest` in the `organization` package store.
{: .fs-6 .fw-300 }

## Table of contents
{: .no_toc .text-delta }

1. TOC
{:toc}

---

## Specification Metadata

- **RDF / OWL Class**: `robos:PullRequest`
- **Aliases / Target Classes**: `robos:PullRequest`, `robos:MergeRequest`
- **SHACL Shape ID**: `urn:robos:shape:PullRequestShape`
- **Governing Package**: [Organization & Teams (robos.org)]({{ '/schemas/organization.html' | relative_url }}) (`organization`)
- **Namespace**: `robos.org`

---

## Entity Relationship & Schema Context

<div style="margin: 1.5rem 0; padding: 1.25rem; background: #161b22; border: 1px solid #30363d; border-radius: 8px;">
  <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.75rem; flex-wrap: wrap; gap: 0.5rem;">
    <span style="font-size: 1.15rem; font-weight: 700; color: #38bdf8;">Pull Request</span>
    <span style="font-family: monospace; background: #121927; color: #00e5ff; border: 1px solid rgba(0, 229, 255, 0.4); padding: 0.2rem 0.6rem; border-radius: 6px; font-size: 0.85rem;">robos:PullRequest</span>
  </div>
  <p style="margin-bottom: 0.75rem; font-size: 0.92rem; color: #c9d1d9;">Governed by W3C SHACL shape <code>urn:robos:shape:PullRequestShape</code> within the <strong>Organization & Teams (robos.org)</strong> (<code>robos.org</code>) package store.</p>
  <div style="display: flex; flex-wrap: wrap; gap: 0.5rem; margin-top: 0.5rem;">
    <span style="background: #0d1117; border: 1px solid #21262d; padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.8rem; color: #8b949e;"><code>dcterms:title</code></span>
    <span style="background: #0d1117; border: 1px solid #21262d; padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.8rem; color: #8b949e;"><code>robos:prNumber</code></span>
    <span style="background: #0d1117; border: 1px solid #21262d; padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.8rem; color: #8b949e;"><code>robos:sourceBranch</code></span>
    <span style="background: #0d1117; border: 1px solid #21262d; padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.8rem; color: #8b949e;"><code>robos:targetBranch</code></span>
    <span style="background: #0d1117; border: 1px solid #21262d; padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.8rem; color: #8b949e;"><code>robos:status</code></span>
  </div>
</div>

---

## Property Constraints & SHACL Rules

| Property Path | Name | Multiplicity | Data Type | Constraint Rule / Validation Message |
|---|---|---|---|---|
| **`dcterms:title`** | Title / Display Name | `1..*` | `xsd:string` | Pull Request must have a title. |
| **`robos:prNumber`** | Pull Request Number | `1..*` | `xsd:integer` | Pull Request must specify PR number. |
| **`robos:sourceBranch`** | Source Branch | `1..*` | `xsd:string` | Pull Request must declare source branch. |
| **`robos:targetBranch`** | Target Branch | `1..*` | `xsd:string` | Pull Request must declare target branch. |
| **`robos:status`** | Lifecycle Status | `1..*` | `xsd:string` | Pull Request must declare status (open, merged, closed). |

---

## Canonical OSLC JSON-LD Example

```json
{
  "@id": "urn:robos:organization:pull-request-sample",
  "@type": [
    "robos:PullRequest",
    "robos:MergeRequest",
    "oslc:Resource"
  ],
  "dcterms:title": "Sample Pull Request",
  "dcterms:description": "Canonical reference instance for robos:PullRequest.",
  "robos:package": "organization",
  "robos:namespace": "robos.org",
  "robos:prNumber": 142,
  "robos:sourceBranch": "feat/new-feature",
  "robos:targetBranch": "main",
  "robos:status": "active"
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
        "@id": "urn:robos:organization:pull-request-sample",
        "@type": [
            "robos:PullRequest",
            "robos:MergeRequest",
            "oslc:Resource"
        ],
        "dcterms:title": "Sample Pull Request",
        "dcterms:description": "Canonical reference instance for robos:PullRequest.",
        "robos:package": "organization",
        "robos:namespace": "robos.org",
        "robos:prNumber": 142,
        "robos:sourceBranch": "feat/new-feature",
        "robos:targetBranch": "main",
        "robos:status": "active"
    }
  ],
}));

console.log("Conforms:", result.conforms); // Expected: true
```