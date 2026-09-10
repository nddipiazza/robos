---
title: Certificate Of Completion
layout: default
parent: eLearning Curriculums (robos.learning)
grand_parent: KGraph Schemas
nav_order: 2
permalink: /schemas/learning/certificate-of-completion.html
---

# Schema: `robos:CertificateOfCompletion`
{: .no_toc }

Formal W3C SHACL constraint shape and OSLC JSON-LD specification for `robos:CertificateOfCompletion` in the `learning` package store.
{: .fs-6 .fw-300 }

## Table of contents
{: .no_toc .text-delta }

1. TOC
{:toc}

---

## Specification Metadata

- **RDF / OWL Class**: `robos:CertificateOfCompletion`
- **Aliases / Target Classes**: `robos:CertificateOfCompletion`
- **SHACL Shape ID**: `urn:robos:shape:CertificateOfCompletionShape`
- **Governing Package**: [eLearning Curriculums (robos.learning)]({{ '/schemas/learning.html' | relative_url }}) (`learning`)
- **Namespace**: `robos.learning`
- **Schema.org Classification**: [https://schema.org/EducationalOccupationalCredential](https://schema.org/EducationalOccupationalCredential)
- **Domain De Facto Standard**: [https://schema.org/EducationalOccupationalCredential](https://schema.org/EducationalOccupationalCredential)
- **Upstream Schema Basis (Refers From)**: [https://schema.org/EducationalOccupationalCredential](https://schema.org/EducationalOccupationalCredential)

---

## Upstream Schema Basis (Refers From) & Global Standards Provenance

This RobOS schema is modeled after and directly aligns with two levels of global standards:
- **Universal Schema.org Class**: [https://schema.org/EducationalOccupationalCredential](https://schema.org/EducationalOccupationalCredential) (100% interoperability with search engines, web indexers, and general AI reasoning)
- **Specialized Domain Standard**: [https://schema.org/EducationalOccupationalCredential](https://schema.org/EducationalOccupationalCredential) (de facto standard for domain-specific ALM, BDD, or infrastructure operations)
- **Canonical Reference**: [https://schema.org/EducationalOccupationalCredential](https://schema.org/EducationalOccupationalCredential)
- **Agent Guidelines**: When autonomous agents generate, expand, or validate instances of `robos:CertificateOfCompletion`, they MUST adhere to and base their output on this referred schema object and universal Schema.org parent class, extending it with RobOS SDLC properties.

---

## Entity Relationship & Schema Context

<div style="margin: 1.5rem 0; padding: 1.25rem; background: #161b22; border: 1px solid #30363d; border-radius: 8px;">
  <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.75rem; flex-wrap: wrap; gap: 0.5rem;">
    <span style="font-size: 1.15rem; font-weight: 700; color: #38bdf8;">Certificate Of Completion</span>
    <span style="font-family: monospace; background: #121927; color: #00e5ff; border: 1px solid rgba(0, 229, 255, 0.4); padding: 0.2rem 0.6rem; border-radius: 6px; font-size: 0.85rem;">robos:CertificateOfCompletion</span>
  </div>
  <p style="margin-bottom: 0.75rem; font-size: 0.92rem; color: #c9d1d9;">Governed by W3C SHACL shape <code>urn:robos:shape:CertificateOfCompletionShape</code> within the <strong>eLearning Curriculums (robos.learning)</strong> (<code>robos.learning</code>) package store.</p>
  <div style="display: flex; flex-wrap: wrap; gap: 0.5rem; margin-top: 0.5rem;">
    <span style="background: #0d1117; border: 1px solid #21262d; padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.8rem; color: #8b949e;"><code>dcterms:title</code></span>
    <span style="background: #0d1117; border: 1px solid #21262d; padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.8rem; color: #8b949e;"><code>robos:recipientUser</code></span>
    <span style="background: #0d1117; border: 1px solid #21262d; padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.8rem; color: #8b949e;"><code>robos:forCourse</code></span>
    <span style="background: #0d1117; border: 1px solid #21262d; padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.8rem; color: #8b949e;"><code>robos:issueDate</code></span>
    <span style="background: #0d1117; border: 1px solid #21262d; padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.8rem; color: #8b949e;"><code>robos:scorePercentage</code></span>
  </div>
</div>

---

## Property Constraints & SHACL Rules

| Property Path | Name | Multiplicity | Data Type | Constraint Rule / Validation Message |
|---|---|---|---|---|
| **`dcterms:title`** | Title / Display Name | `1..*` | `xsd:string` | Certificate of Completion must have a title. |
| **`robos:recipientUser`** | recipientUser | `1..*` | `xsd:string` | Certificate of Completion must specify the recipient user. |
| **`robos:forCourse`** | forCourse | `1..*` | `xsd:string` | Certificate of Completion must link to the completed course (robos:forCourse). |
| **`robos:issueDate`** | issueDate | `1..*` | `xsd:string` | Certificate of Completion must declare an issuance date. |
| **`robos:scorePercentage`** | scorePercentage | `1..*` | `xsd:string` | Certificate of Completion must record the final score percentage. |

---

## Canonical OSLC JSON-LD Example

```json
{
  "@id": "urn:robos:learning:certificate-of-completion-sample",
  "@type": [
    "robos:CertificateOfCompletion",
    "schema:EducationalOccupationalCredential",
    "oslc:Resource"
  ],
  "dcterms:title": "Sample Certificate Of Completion",
  "dcterms:description": "Canonical reference instance for robos:CertificateOfCompletion.",
  "robos:package": "learning",
  "robos:namespace": "robos.learning",
  "robos:schemaOrgType": "https://schema.org/EducationalOccupationalCredential",
  "robos:domainStandard": "https://schema.org/EducationalOccupationalCredential",
  "robos:refersFrom": "https://schema.org/EducationalOccupationalCredential"
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
        "@id": "urn:robos:learning:certificate-of-completion-sample",
        "@type": [
            "robos:CertificateOfCompletion",
            "schema:EducationalOccupationalCredential",
            "oslc:Resource"
        ],
        "dcterms:title": "Sample Certificate Of Completion",
        "dcterms:description": "Canonical reference instance for robos:CertificateOfCompletion.",
        "robos:package": "learning",
        "robos:namespace": "robos.learning",
        "robos:schemaOrgType": "https://schema.org/EducationalOccupationalCredential",
        "robos:domainStandard": "https://schema.org/EducationalOccupationalCredential",
        "robos:refersFrom": "https://schema.org/EducationalOccupationalCredential"
    }
  ],
}));

console.log("Conforms:", result.conforms); // Expected: true
```