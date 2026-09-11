---
title: Microservice
layout: default
parent: Services & Contracts (robos.services)
grand_parent: KGraph Schemas
nav_order: 1
permalink: /schemas/services/microservice.html
---

# Schema: `robos:Microservice`
{: .no_toc }

Formal W3C SHACL constraint shape and OSLC JSON-LD specification for `robos:Microservice` in the `services` package store.
{: .fs-6 .fw-300 }

## Table of contents
{: .no_toc .text-delta }

1. TOC
{:toc}

---

## Specification Metadata

- **RDF / OWL Class**: `robos:Microservice`
- **Aliases / Target Classes**: `robos:Microservice`
- **SHACL Shape ID**: `urn:robos:shape:MicroserviceShape`
- **Governing Package**: [Services & Contracts (robos.services)]({{ '/schemas/services.html' | relative_url }}) (`services`)
- **Namespace**: `robos.services`
- **Schema.org Classification**: [https://schema.org/SoftwareApplication](https://schema.org/SoftwareApplication)
- **Domain De Facto Standard**: [https://w3id.org/c4/Container](https://w3id.org/c4/Container)
- **Upstream Schema Basis (Refers From)**: [https://w3id.org/c4/Container](https://w3id.org/c4/Container)

---

## Upstream Schema Basis (Refers From) & Global Standards Provenance

This RobOS schema is modeled after and directly aligns with two levels of global standards:
- **Universal Schema.org Class**: [https://schema.org/SoftwareApplication](https://schema.org/SoftwareApplication) (100% interoperability with search engines, web indexers, and general AI reasoning)
- **Specialized Domain Standard**: [https://w3id.org/c4/Container](https://w3id.org/c4/Container) (de facto standard for domain-specific ALM, BDD, or infrastructure operations)
- **Canonical Reference**: [https://w3id.org/c4/Container](https://w3id.org/c4/Container)
- **Agent Guidelines**: When autonomous agents generate, expand, or validate instances of `robos:Microservice`, they MUST adhere to and base their output on this referred schema object and universal Schema.org parent class, extending it with RobOS SDLC properties.

---

## Entity Relationship & Schema Context

<div style="margin: 1.5rem 0; padding: 1.25rem; background: #161b22; border: 1px solid #30363d; border-radius: 8px;">
  <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.75rem; flex-wrap: wrap; gap: 0.5rem;">
    <span style="font-size: 1.15rem; font-weight: 700; color: #38bdf8;">Microservice</span>
    <span style="font-family: monospace; background: #121927; color: #00e5ff; border: 1px solid rgba(0, 229, 255, 0.4); padding: 0.2rem 0.6rem; border-radius: 6px; font-size: 0.85rem;">robos:Microservice</span>
  </div>
  <p style="margin-bottom: 0.75rem; font-size: 0.92rem; color: #c9d1d9;">Governed by W3C SHACL shape <code>urn:robos:shape:MicroserviceShape</code> within the <strong>Services & Contracts (robos.services)</strong> (<code>robos.services</code>) package store.</p>
  <div style="display: flex; flex-wrap: wrap; gap: 0.5rem; margin-top: 0.5rem;">
    <span style="background: #0d1117; border: 1px solid #21262d; padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.8rem; color: #8b949e;"><code>robos:repository</code></span>
    <span style="background: #0d1117; border: 1px solid #21262d; padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.8rem; color: #8b949e;"><code>robos:ownerTeam</code></span>
    <span style="background: #0d1117; border: 1px solid #21262d; padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.8rem; color: #8b949e;"><code>dcterms:title</code></span>
  </div>
</div>

---

**RobOS classification:** Services & processing. These RobOS-owned codes use Schema.org CategoryCode vocabulary.

## Property Constraints & SHACL Rules

| Property Path | Name | Multiplicity | Data Type | Classification | Constraint Rule / Validation Message |
|---|---|---|---|---|---|
| **`robos:repository`** | Git Repository | `1..1` | `xsd:string` | Services & processing, Applications & entry points, Libraries & build systems, Source control & artifacts | Microservice must define exactly one repository. |
| **`robos:ownerTeam`** | Owner Team | `0..*` | `URI (robos:Team)` | Services & processing | Record an owner team when known; unknown ownership must not be fabricated. |
| **`dcterms:title`** | Title / Display Name | `1..*` | `xsd:string` | Services & processing, Applications & entry points, Contracts & data models, Data stores & messaging, Libraries & build systems, Infrastructure & delivery, Organization & people, Projects & work items, Source control & artifacts, Agents & MCP, Documentation & decisions, Learning & assessment, Testing & behavior | Microservice must have a title. |

---

## Canonical OSLC JSON-LD Example

```json
{
  "@id": "urn:robos:service:billing-api",
  "@type": [
    "oslc_am:Resource",
    "robos:Microservice",
    "schema:SoftwareApplication"
  ],
  "dcterms:title": "Billing API Service",
  "robos:technology": "Go 1.22 / Gin",
  "robos:repository": "github.com/acme/billing-api",
  "robos:package": "services",
  "robos:namespace": "robos.services",
  "robos:ownerTeam": "urn:robos:team:order-processing",
  "robos:usesDatabase": "urn:robos:db:acme-orders-postgres",
  "robos:publishesTo": "urn:robos:broker:acme-event-kafka",
  "robos:hasPipeline": "urn:robos:pipeline:checkout-service-ci",
  "robos:deployedTo": "urn:robos:gitops:checkout-service-argocd",
  "robos:implementsContract": [
    "urn:robos:contract:orders-grpc"
  ],
  "robos:schemaOrgType": "https://schema.org/SoftwareApplication",
  "robos:domainStandard": "https://w3id.org/c4/Container"
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
        "@id": "urn:robos:service:billing-api",
        "@type": [
            "oslc_am:Resource",
            "robos:Microservice",
            "schema:SoftwareApplication"
        ],
        "dcterms:title": "Billing API Service",
        "robos:technology": "Go 1.22 / Gin",
        "robos:repository": "github.com/acme/billing-api",
        "robos:package": "services",
        "robos:namespace": "robos.services",
        "robos:ownerTeam": "urn:robos:team:order-processing",
        "robos:usesDatabase": "urn:robos:db:acme-orders-postgres",
        "robos:publishesTo": "urn:robos:broker:acme-event-kafka",
        "robos:hasPipeline": "urn:robos:pipeline:checkout-service-ci",
        "robos:deployedTo": "urn:robos:gitops:checkout-service-argocd",
        "robos:implementsContract": [
            "urn:robos:contract:orders-grpc"
        ],
        "robos:schemaOrgType": "https://schema.org/SoftwareApplication",
        "robos:domainStandard": "https://w3id.org/c4/Container"
    }
  ],
}));

console.log("Conforms:", result.conforms); // Expected: true
```