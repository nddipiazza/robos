---
title: Comment
layout: default
parent: Organization & Teams (robos.org)
grand_parent: KGraph Schemas
nav_order: 18
permalink: /schemas/organization/comment.html
---

# Schema: `robos:Comment`
{: .no_toc }

Formal W3C SHACL constraint shape and OSLC JSON-LD specification for `robos:Comment` in the `organization` package store.
{: .fs-6 .fw-300 }

## Table of contents
{: .no_toc .text-delta }

1. TOC
{:toc}

---

## Specification Metadata

- **RDF / OWL Class**: `robos:Comment`
- **Aliases / Target Classes**: `robos:Comment`, `robos:WorkItemComment`, `robos:DiscussionComment`
- **SHACL Shape ID**: `urn:robos:shape:CommentShape`
- **Governing Package**: [Organization & Teams (robos.org)]({{ '/schemas/organization.html' | relative_url }}) (`organization`)
- **Namespace**: `robos.org`
- **Schema.org Classification**: [https://schema.org/Comment](https://schema.org/Comment)
- **Domain De Facto Standard**: [http://open-services.net/ns/core#Comment](http://open-services.net/ns/core#Comment)
- **Upstream Schema Basis (Refers From)**: [https://schema.org/Comment](https://schema.org/Comment)

---

## Upstream Schema Basis (Refers From) & Global Standards Provenance

This RobOS schema is modeled after and directly aligns with two levels of global standards:
- **Universal Schema.org Class**: [https://schema.org/Comment](https://schema.org/Comment) (100% interoperability with search engines, web indexers, and general AI reasoning)
- **Specialized Domain Standard**: [http://open-services.net/ns/core#Comment](http://open-services.net/ns/core#Comment) (de facto standard for domain-specific ALM, BDD, or infrastructure operations)
- **Canonical Reference**: [https://schema.org/Comment](https://schema.org/Comment)
- **Agent Guidelines**: When autonomous agents generate, expand, or validate instances of `robos:Comment`, they MUST adhere to and base their output on this referred schema object and universal Schema.org parent class, extending it with RobOS SDLC properties.

---

## Entity Relationship & Schema Context

<div style="margin: 1.5rem 0; padding: 1.25rem; background: #161b22; border: 1px solid #30363d; border-radius: 8px;">
  <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.75rem; flex-wrap: wrap; gap: 0.5rem;">
    <span style="font-size: 1.15rem; font-weight: 700; color: #38bdf8;">Comment</span>
    <span style="font-family: monospace; background: #121927; color: #00e5ff; border: 1px solid rgba(0, 229, 255, 0.4); padding: 0.2rem 0.6rem; border-radius: 6px; font-size: 0.85rem;">robos:Comment</span>
  </div>
  <p style="margin-bottom: 0.75rem; font-size: 0.92rem; color: #c9d1d9;">Governed by W3C SHACL shape <code>urn:robos:shape:CommentShape</code> within the <strong>Organization & Teams (robos.org)</strong> (<code>robos.org</code>) package store.</p>
  <div style="display: flex; flex-wrap: wrap; gap: 0.5rem; margin-top: 0.5rem;">
    <span style="background: #0d1117; border: 1px solid #21262d; padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.8rem; color: #8b949e;"><code>robos:content</code></span>
    <span style="background: #0d1117; border: 1px solid #21262d; padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.8rem; color: #8b949e;"><code>robos:author</code></span>
    <span style="background: #0d1117; border: 1px solid #21262d; padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.8rem; color: #8b949e;"><code>robos:createdAt</code></span>
    <span style="background: #0d1117; border: 1px solid #21262d; padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.8rem; color: #8b949e;"><code>robos:parentItem</code></span>
  </div>
</div>

---

**RobOS classification:** Projects & work items. These RobOS-owned codes use Schema.org CategoryCode vocabulary.

## Property Constraints & SHACL Rules

| Property Path | Name | Multiplicity | Data Type | Classification | Constraint Rule / Validation Message |
|---|---|---|---|---|---|
| **`robos:content`** | content | `1..*` | `xsd:string` | Testing & behavior | Comment must have content. |
| **`robos:author`** | author | `1..*` | `xsd:string` | Source control & artifacts | Comment must specify an author. |
| **`robos:createdAt`** | Created At Timestamp | `1..*` | `xsd:dateTime` | Projects & work items | Comment must specify creation timestamp. |
| **`robos:parentItem`** | Parent Item / Thread | `1..*` | `URI (robos:DiscussionThread | robos:Task | robos:PullRequest | robos:Comment)` | Projects & work items | Comment must link to parent work item, pull request, or thread. |

---

## Canonical OSLC JSON-LD Example

```json
{
  "@id": "urn:robos:organization:comment-sample",
  "@type": [
    "robos:Comment",
    "robos:WorkItemComment",
    "robos:DiscussionComment",
    "schema:Comment",
    "oslc:Resource"
  ],
  "dcterms:title": "Sample Comment",
  "dcterms:description": "Canonical reference instance for robos:Comment.",
  "robos:package": "organization",
  "robos:namespace": "robos.org",
  "robos:content": "sample docstring content",
  "robos:schemaOrgType": "https://schema.org/Comment",
  "robos:domainStandard": "http://open-services.net/ns/core#Comment",
  "robos:refersFrom": "https://schema.org/Comment"
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
        "@id": "urn:robos:organization:comment-sample",
        "@type": [
            "robos:Comment",
            "robos:WorkItemComment",
            "robos:DiscussionComment",
            "schema:Comment",
            "oslc:Resource"
        ],
        "dcterms:title": "Sample Comment",
        "dcterms:description": "Canonical reference instance for robos:Comment.",
        "robos:package": "organization",
        "robos:namespace": "robos.org",
        "robos:content": "sample docstring content",
        "robos:schemaOrgType": "https://schema.org/Comment",
        "robos:domainStandard": "http://open-services.net/ns/core#Comment",
        "robos:refersFrom": "https://schema.org/Comment"
    }
  ],
}));

console.log("Conforms:", result.conforms); // Expected: true
```