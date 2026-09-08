---
title: Testing Library
layout: default
parent: Testing, Quality & BDD (robos.testing)
grand_parent: KGraph Schemas
nav_order: 11
permalink: /schemas/testing/testing-library.html
---

# Schema: `robos:TestingLibrary`
{: .no_toc }

Formal W3C SHACL constraint shape and OSLC JSON-LD specification for `robos:TestingLibrary` in the `testing` package store.
{: .fs-6 .fw-300 }

## Table of contents
{: .no_toc .text-delta }

1. TOC
{:toc}

---

## Specification Metadata

- **RDF / OWL Class**: `robos:TestingLibrary`
- **Aliases / Target Classes**: `robos:TestingLibrary`, `robos:TestFramework`
- **SHACL Shape ID**: `urn:robos:shape:TestingLibraryShape`
- **Governing Package**: [Testing, Quality & BDD (robos.testing)]({{ '/schemas/testing.html' | relative_url }}) (`testing`)
- **Namespace**: `robos.testing`
- **Upstream Schema Basis (Refers From)**: [https://schema.org/SoftwareApplication](https://schema.org/SoftwareApplication)

---

## Upstream Schema Basis (Refers From)

This RobOS schema is modeled after and directly expands upon the upstream canonical standard:
- **Canonical Reference**: [https://schema.org/SoftwareApplication](https://schema.org/SoftwareApplication)
- **Provenance & Alignment**: When autonomous agents generate, expand, or validate instances of `robos:TestingLibrary`, they MUST adhere to and base their output on this referred schema object, extending it with RobOS SDLC properties.

---

## Entity Relationship & Schema Context

<div style="margin: 1.5rem 0; padding: 1.25rem; background: #161b22; border: 1px solid #30363d; border-radius: 8px;">
  <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.75rem; flex-wrap: wrap; gap: 0.5rem;">
    <span style="font-size: 1.15rem; font-weight: 700; color: #38bdf8;">Testing Library</span>
    <span style="font-family: monospace; background: #121927; color: #00e5ff; border: 1px solid rgba(0, 229, 255, 0.4); padding: 0.2rem 0.6rem; border-radius: 6px; font-size: 0.85rem;">robos:TestingLibrary</span>
  </div>
  <p style="margin-bottom: 0.75rem; font-size: 0.92rem; color: #c9d1d9;">Governed by W3C SHACL shape <code>urn:robos:shape:TestingLibraryShape</code> within the <strong>Testing, Quality & BDD (robos.testing)</strong> (<code>robos.testing</code>) package store.</p>
  <div style="display: flex; flex-wrap: wrap; gap: 0.5rem; margin-top: 0.5rem;">
    <span style="background: #0d1117; border: 1px solid #21262d; padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.8rem; color: #8b949e;"><code>dcterms:title</code></span>
    <span style="background: #0d1117; border: 1px solid #21262d; padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.8rem; color: #8b949e;"><code>robos:testingType</code></span>
    <span style="background: #0d1117; border: 1px solid #21262d; padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.8rem; color: #8b949e;"><code>robos:language</code></span>
  </div>
</div>

---

## Property Constraints & SHACL Rules

| Property Path | Name | Multiplicity | Data Type | Constraint Rule / Validation Message |
|---|---|---|---|---|
| **`dcterms:title`** | Title / Display Name | `1..*` | `xsd:string` | Testing Library must have a title / name. |
| **`robos:testingType`** | Testing Paradigm | `1..*` | `xsd:string` | Testing Library must declare testing paradigm (bdd, unit, e2e, contract, performance, mocking, api). |
| **`robos:language`** | Programming Language | `1..*` | `xsd:string` | Testing Library must declare target language ecosystem (polyglot, java, javascript, typescript, python, go, rust). |

---

## Canonical OSLC JSON-LD Example

```json
{
  "@id": "urn:robos:testing:cucumber",
  "@type": [
    "robos:TestingLibrary",
    "robos:TestFramework",
    "oslc:Resource"
  ],
  "dcterms:title": "Cucumber",
  "dcterms:description": "Behavior-Driven Development (BDD) testing tool executing plain-text Gherkin specifications.",
  "robos:testingType": "bdd",
  "robos:language": "polyglot",
  "robos:website": "https://cucumber.io",
  "robos:package": "testing",
  "robos:namespace": "robos.testing",
  "robos:refersFrom": "https://schema.org/SoftwareApplication"
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
        "@id": "urn:robos:testing:cucumber",
        "@type": [
            "robos:TestingLibrary",
            "robos:TestFramework",
            "oslc:Resource"
        ],
        "dcterms:title": "Cucumber",
        "dcterms:description": "Behavior-Driven Development (BDD) testing tool executing plain-text Gherkin specifications.",
        "robos:testingType": "bdd",
        "robos:language": "polyglot",
        "robos:website": "https://cucumber.io",
        "robos:package": "testing",
        "robos:namespace": "robos.testing",
        "robos:refersFrom": "https://schema.org/SoftwareApplication"
    }
  ],
}));

console.log("Conforms:", result.conforms); // Expected: true
```