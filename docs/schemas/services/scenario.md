---
title: Scenario
layout: default
parent: Services & Contracts (robos.services)
grand_parent: KGraph Schemas
nav_order: 9
permalink: /schemas/services/scenario.html
---

# Schema: `robos:Scenario`
{: .no_toc }

Formal W3C SHACL constraint shape and OSLC JSON-LD specification for `robos:Scenario` in the `services` package store.
{: .fs-6 .fw-300 }

## Table of contents
{: .no_toc .text-delta }

1. TOC
{:toc}

---

## Specification Metadata

- **RDF / OWL Class**: `robos:Scenario`
- **Aliases / Target Classes**: `robos:Scenario`
- **SHACL Shape ID**: `urn:robos:shape:ScenarioShape`
- **Governing Package**: [Services & Contracts (robos.services)]({{ '/schemas/services.html' | relative_url }}) (`services`)
- **Namespace**: `robos.services`

---

## Entity Relationship & Schema Context

<div style="margin: 1.5rem 0; padding: 1.25rem; background: #161b22; border: 1px solid #30363d; border-radius: 8px;">
  <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.75rem; flex-wrap: wrap; gap: 0.5rem;">
    <span style="font-size: 1.15rem; font-weight: 700; color: #38bdf8;">Scenario</span>
    <span style="font-family: monospace; background: #121927; color: #00e5ff; border: 1px solid rgba(0, 229, 255, 0.4); padding: 0.2rem 0.6rem; border-radius: 6px; font-size: 0.85rem;">robos:Scenario</span>
  </div>
  <p style="margin-bottom: 0.75rem; font-size: 0.92rem; color: #c9d1d9;">Governed by W3C SHACL shape <code>urn:robos:shape:ScenarioShape</code> within the <strong>Services & Contracts (robos.services)</strong> (<code>robos.services</code>) package store.</p>
  <div style="display: flex; flex-wrap: wrap; gap: 0.5rem; margin-top: 0.5rem;">
    <span style="background: #0d1117; border: 1px solid #21262d; padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.8rem; color: #8b949e;"><code>dcterms:title</code></span>
    <span style="background: #0d1117; border: 1px solid #21262d; padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.8rem; color: #8b949e;"><code>robos:steps</code></span>
  </div>
</div>

---

## Property Constraints & SHACL Rules

| Property Path | Name | Multiplicity | Data Type | Constraint Rule / Validation Message |
|---|---|---|---|---|
| **`dcterms:title`** | Title / Display Name | `1..*` | `xsd:string` | Scenario must have a title. |
| **`robos:steps`** | Scenario Steps | `1..*` | `Array<robos:ScenarioStep>` | Scenario must define execution steps. |

---

## Canonical OSLC JSON-LD Example

```json
{
  "@id": "urn:robos:services:scenario-sample",
  "@type": [
    "robos:Scenario",
    "oslc:Resource"
  ],
  "dcterms:title": "Sample Scenario",
  "dcterms:description": "Canonical reference instance for robos:Scenario.",
  "robos:package": "services",
  "robos:namespace": "robos.services",
  "robos:steps": [
    {
      "keyword": "Given",
      "stepText": "a running service"
    }
  ]
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
        "@id": "urn:robos:services:scenario-sample",
        "@type": [
            "robos:Scenario",
            "oslc:Resource"
        ],
        "dcterms:title": "Sample Scenario",
        "dcterms:description": "Canonical reference instance for robos:Scenario.",
        "robos:package": "services",
        "robos:namespace": "robos.services",
        "robos:steps": [
            {
                "keyword": "Given",
                "stepText": "a running service"
            }
        ]
    }
  ],
}));

console.log("Conforms:", result.conforms); // Expected: true
```