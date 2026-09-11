---
title: Step Definition
layout: default
parent: Testing, Quality & BDD (robos.testing)
grand_parent: KGraph Schemas
nav_order: 8
permalink: /schemas/testing/step-definition.html
---

# Schema: `robos:StepDefinition`
{: .no_toc }

Formal W3C SHACL constraint shape and OSLC JSON-LD specification for `robos:StepDefinition` in the `testing` package store.
{: .fs-6 .fw-300 }

## Table of contents
{: .no_toc .text-delta }

1. TOC
{:toc}

---

## Specification Metadata

- **RDF / OWL Class**: `robos:StepDefinition`
- **Aliases / Target Classes**: `robos:StepDefinition`
- **SHACL Shape ID**: `urn:robos:shape:StepDefinitionShape`
- **Governing Package**: [Testing, Quality & BDD (robos.testing)]({{ '/schemas/testing.html' | relative_url }}) (`testing`)
- **Namespace**: `robos.testing`
- **Schema.org Classification**: [https://schema.org/SoftwareSourceCode](https://schema.org/SoftwareSourceCode)
- **Domain De Facto Standard**: [https://cucumber.io/docs/cucumber/step-definitions/](https://cucumber.io/docs/cucumber/step-definitions/)
- **Upstream Schema Basis (Refers From)**: [https://cucumber.io/docs/cucumber/step-definitions/](https://cucumber.io/docs/cucumber/step-definitions/)

---

## Upstream Schema Basis (Refers From) & Global Standards Provenance

This RobOS schema is modeled after and directly aligns with two levels of global standards:
- **Universal Schema.org Class**: [https://schema.org/SoftwareSourceCode](https://schema.org/SoftwareSourceCode) (100% interoperability with search engines, web indexers, and general AI reasoning)
- **Specialized Domain Standard**: [https://cucumber.io/docs/cucumber/step-definitions/](https://cucumber.io/docs/cucumber/step-definitions/) (de facto standard for domain-specific ALM, BDD, or infrastructure operations)
- **Canonical Reference**: [https://cucumber.io/docs/cucumber/step-definitions/](https://cucumber.io/docs/cucumber/step-definitions/)
- **Agent Guidelines**: When autonomous agents generate, expand, or validate instances of `robos:StepDefinition`, they MUST adhere to and base their output on this referred schema object and universal Schema.org parent class, extending it with RobOS SDLC properties.

---

## Entity Relationship & Schema Context

<div style="margin: 1.5rem 0; padding: 1.25rem; background: #161b22; border: 1px solid #30363d; border-radius: 8px;">
  <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.75rem; flex-wrap: wrap; gap: 0.5rem;">
    <span style="font-size: 1.15rem; font-weight: 700; color: #38bdf8;">Step Definition</span>
    <span style="font-family: monospace; background: #121927; color: #00e5ff; border: 1px solid rgba(0, 229, 255, 0.4); padding: 0.2rem 0.6rem; border-radius: 6px; font-size: 0.85rem;">robos:StepDefinition</span>
  </div>
  <p style="margin-bottom: 0.75rem; font-size: 0.92rem; color: #c9d1d9;">Governed by W3C SHACL shape <code>urn:robos:shape:StepDefinitionShape</code> within the <strong>Testing, Quality & BDD (robos.testing)</strong> (<code>robos.testing</code>) package store.</p>
  <div style="display: flex; flex-wrap: wrap; gap: 0.5rem; margin-top: 0.5rem;">
    <span style="background: #0d1117; border: 1px solid #21262d; padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.8rem; color: #8b949e;"><code>dcterms:title</code></span>
    <span style="background: #0d1117; border: 1px solid #21262d; padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.8rem; color: #8b949e;"><code>robos:regexPattern</code></span>
    <span style="background: #0d1117; border: 1px solid #21262d; padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.8rem; color: #8b949e;"><code>robos:codeFile</code></span>
  </div>
</div>

---

**RobOS classification:** Testing & behavior. These RobOS-owned codes use Schema.org CategoryCode vocabulary.

## Property Constraints & SHACL Rules

| Property Path | Name | Multiplicity | Data Type | Classification | Constraint Rule / Validation Message |
|---|---|---|---|---|---|
| **`dcterms:title`** | Title / Display Name | `1..*` | `xsd:string` | Services & processing, Applications & entry points, Contracts & data models, Data stores & messaging, Libraries & build systems, Infrastructure & delivery, Organization & people, Projects & work items, Source control & artifacts, Agents & MCP, Documentation & decisions, Learning & assessment, Testing & behavior | Step Definition must have a title. |
| **`robos:regexPattern`** | Regex Pattern | `1..*` | `xsd:string` | Testing & behavior | Step Definition must specify matching regex expression. |
| **`robos:codeFile`** | Code File | `1..*` | `xsd:string` | Testing & behavior | Step Definition must link to implementation source file. |

---

## Canonical OSLC JSON-LD Example

```json
{
  "@id": "urn:robos:stepdef:customer-submits-order",
  "@type": [
    "robos:StepDefinition",
    "schema:SoftwareSourceCode"
  ],
  "dcterms:title": "StepDef: Customer Submits Order",
  "robos:regexPattern": "^the customer submits order with total \\$(\\d+)$",
  "robos:codeFile": "tests/steps/checkout_steps.js",
  "robos:functionName": "submitOrderStep",
  "robos:package": "testing",
  "robos:namespace": "robos.testing",
  "robos:refersFrom": "https://cucumber.io/docs/cucumber/step-definitions/",
  "robos:schemaOrgType": "https://schema.org/SoftwareSourceCode",
  "robos:domainStandard": "https://cucumber.io/docs/cucumber/step-definitions/"
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
        "@id": "urn:robos:stepdef:customer-submits-order",
        "@type": [
            "robos:StepDefinition",
            "schema:SoftwareSourceCode"
        ],
        "dcterms:title": "StepDef: Customer Submits Order",
        "robos:regexPattern": "^the customer submits order with total \\$(\\d+)$",
        "robos:codeFile": "tests/steps/checkout_steps.js",
        "robos:functionName": "submitOrderStep",
        "robos:package": "testing",
        "robos:namespace": "robos.testing",
        "robos:refersFrom": "https://cucumber.io/docs/cucumber/step-definitions/",
        "robos:schemaOrgType": "https://schema.org/SoftwareSourceCode",
        "robos:domainStandard": "https://cucumber.io/docs/cucumber/step-definitions/"
    }
  ],
}));

console.log("Conforms:", result.conforms); // Expected: true
```