---
title: Team
layout: default
parent: Organization & Teams (robos.org)
grand_parent: KGraph Schemas
nav_order: 1
permalink: /schemas/organization/team.html
---

# Schema: `robos:Team`
{: .no_toc }

Formal W3C SHACL constraint shape and OSLC JSON-LD specification for `robos:Team` in the `organization` package store.
{: .fs-6 .fw-300 }

## Table of contents
{: .no_toc .text-delta }

1. TOC
{:toc}

---

## Specification Metadata

- **RDF / OWL Class**: `robos:Team`
- **Aliases / Target Classes**: `robos:Team`
- **SHACL Shape ID**: `urn:robos:shape:TeamShape`
- **Governing Package**: [Organization & Teams (robos.org)]({{ '/schemas/organization.html' | relative_url }}) (`organization`)
- **Namespace**: `robos.org`

---

## Entity Relationship Diagram

```mermaid
graph LR
    ThisNode["Team<br/><code>robos:Team</code>"]:::primary
    classDef primary fill:#16243b,stroke:#00e5ff,stroke-width:2.5px,color:#ffffff;
```

---

## Property Constraints & SHACL Rules

| Property Path | Name | Multiplicity | Data Type | Constraint Rule / Validation Message |
|---|---|---|---|---|
| **`dcterms:title`** | Title / Display Name | `1..*` | `xsd:string` | Team must have a display name. |

---

## Canonical OSLC JSON-LD Example

```json
{
  "@id": "urn:robos:team:core-platform",
  "@type": [
    "robos:Team"
  ],
  "dcterms:title": "Core Platform & Infrastructure",
  "robos:topology": "platform",
  "robos:lead": "urn:robos:person:sconnor",
  "robos:hasMember": [
    "urn:robos:person:sconnor",
    "urn:robos:person:marcus-wright"
  ],
  "robos:package": "organization",
  "robos:namespace": "robos.org"
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
        "@id": "urn:robos:team:core-platform",
        "@type": [
            "robos:Team"
        ],
        "dcterms:title": "Core Platform & Infrastructure",
        "robos:topology": "platform",
        "robos:lead": "urn:robos:person:sconnor",
        "robos:hasMember": [
            "urn:robos:person:sconnor",
            "urn:robos:person:marcus-wright"
        ],
        "robos:package": "organization",
        "robos:namespace": "robos.org"
    }
  ],
}));

console.log("Conforms:", result.conforms); // Expected: true
```