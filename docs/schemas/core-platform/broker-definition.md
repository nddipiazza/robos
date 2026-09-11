---
title: Broker Definition
layout: default
parent: Core Platform (robos.core)
grand_parent: KGraph Schemas
nav_order: 20
permalink: /schemas/core-platform/broker-definition.html
---

# Schema: `robos:BrokerDefinition`
{: .no_toc }

Formal W3C SHACL constraint shape and OSLC JSON-LD specification for `robos:BrokerDefinition` in the `core-platform` package store.
{: .fs-6 .fw-300 }

## Table of contents
{: .no_toc .text-delta }

1. TOC
{:toc}

---

## Specification Metadata

- **RDF / OWL Class**: `robos:BrokerDefinition`
- **Aliases / Target Classes**: `robos:BrokerDefinition`
- **SHACL Shape ID**: `robos:BrokerDefinitionShape`
- **Governing Package**: [Core Platform (robos.core)]({{ '/schemas/core-platform.html' | relative_url }}) (`core-platform`)
- **Namespace**: `robos.platform`
- **Schema.org Classification**: [https://schema.org/Service](https://schema.org/Service)
- **Domain De Facto Standard**: [https://schema.org/Service](https://schema.org/Service)
- **Upstream Schema Basis (Refers From)**: [https://schema.org/Service](https://schema.org/Service)

---

## Upstream Schema Basis (Refers From) & Global Standards Provenance

This RobOS schema is modeled after and directly aligns with two levels of global standards:
- **Universal Schema.org Class**: [https://schema.org/Service](https://schema.org/Service) (100% interoperability with search engines, web indexers, and general AI reasoning)
- **Specialized Domain Standard**: [https://schema.org/Service](https://schema.org/Service) (de facto standard for domain-specific ALM, BDD, or infrastructure operations)
- **Canonical Reference**: [https://schema.org/Service](https://schema.org/Service)
- **Agent Guidelines**: When autonomous agents generate, expand, or validate instances of `robos:BrokerDefinition`, they MUST adhere to and base their output on this referred schema object and universal Schema.org parent class, extending it with RobOS SDLC properties.

---

## Entity Relationship & Schema Context

<div style="margin: 1.5rem 0; padding: 1.25rem; background: #161b22; border: 1px solid #30363d; border-radius: 8px;">
  <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.75rem; flex-wrap: wrap; gap: 0.5rem;">
    <span style="font-size: 1.15rem; font-weight: 700; color: #38bdf8;">Broker Definition</span>
    <span style="font-family: monospace; background: #121927; color: #00e5ff; border: 1px solid rgba(0, 229, 255, 0.4); padding: 0.2rem 0.6rem; border-radius: 6px; font-size: 0.85rem;">robos:BrokerDefinition</span>
  </div>
  <p style="margin-bottom: 0.75rem; font-size: 0.92rem; color: #c9d1d9;">Governed by W3C SHACL shape <code>robos:BrokerDefinitionShape</code> within the <strong>Core Platform (robos.core)</strong> (<code>robos.platform</code>) package store.</p>
  <div style="display: flex; flex-wrap: wrap; gap: 0.5rem; margin-top: 0.5rem;">
    <span style="background: #0d1117; border: 1px solid #21262d; padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.8rem; color: #8b949e;"><code>dcterms:title</code></span>
    <span style="background: #0d1117; border: 1px solid #21262d; padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.8rem; color: #8b949e;"><code>robos:brokerType</code></span>
    <span style="background: #0d1117; border: 1px solid #21262d; padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.8rem; color: #8b949e;"><code>robos:evidence</code></span>
  </div>
</div>

---

## Property Constraints & SHACL Rules

| Property Path | Name | Multiplicity | Data Type | Constraint Rule / Validation Message |
|---|---|---|---|---|
| **`dcterms:title`** | Title / Display Name | `1..*` | `xsd:string` | Broker definition needs a title. |
| **`robos:brokerType`** | brokerType | `1..*` | `xsd:string` | Broker definition needs its technology. |
| **`robos:evidence`** | evidence | `1..*` | `xsd:string` | Broker definition needs source evidence. |

---

## Canonical OSLC JSON-LD Example

```json
{
  "@id": "urn:robos:core-platform:broker-definition-sample",
  "@type": [
    "robos:BrokerDefinition",
    "schema:Service",
    "oslc:Resource"
  ],
  "dcterms:title": "Sample Broker Definition",
  "dcterms:description": "Canonical reference instance for robos:BrokerDefinition.",
  "robos:package": "core-platform",
  "robos:namespace": "robos.platform",
  "robos:schemaOrgType": "https://schema.org/Service",
  "robos:domainStandard": "https://schema.org/Service",
  "robos:refersFrom": "https://schema.org/Service"
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
        "@id": "urn:robos:core-platform:broker-definition-sample",
        "@type": [
            "robos:BrokerDefinition",
            "schema:Service",
            "oslc:Resource"
        ],
        "dcterms:title": "Sample Broker Definition",
        "dcterms:description": "Canonical reference instance for robos:BrokerDefinition.",
        "robos:package": "core-platform",
        "robos:namespace": "robos.platform",
        "robos:schemaOrgType": "https://schema.org/Service",
        "robos:domainStandard": "https://schema.org/Service",
        "robos:refersFrom": "https://schema.org/Service"
    }
  ],
}));

console.log("Conforms:", result.conforms); // Expected: true
```