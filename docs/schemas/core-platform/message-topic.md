---
title: Message Topic
layout: default
parent: Core Platform (robos.core)
grand_parent: KGraph Schemas
nav_order: 13
permalink: /schemas/core-platform/message-topic.html
---

# Schema: `robos:MessageTopic`
{: .no_toc }

Formal W3C SHACL constraint shape and OSLC JSON-LD specification for `robos:MessageTopic` in the `core-platform` package store.
{: .fs-6 .fw-300 }

## Table of contents
{: .no_toc .text-delta }

1. TOC
{:toc}

---

## Specification Metadata

- **RDF / OWL Class**: `robos:MessageTopic`
- **Aliases / Target Classes**: `robos:MessageTopic`, `robos:MessageQueue`, `robos:EventTopic`
- **SHACL Shape ID**: `urn:robos:shape:MessageTopicShape`
- **Governing Package**: [Core Platform (robos.core)]({{ '/schemas/core-platform.html' | relative_url }}) (`core-platform`)
- **Namespace**: `robos.platform`
- **Schema.org Classification**: [https://schema.org/BroadcastChannel](https://schema.org/BroadcastChannel)
- **Domain De Facto Standard**: [https://kafka.apache.org/documentation/#intro_concepts_and_terms](https://kafka.apache.org/documentation/#intro_concepts_and_terms)
- **Upstream Schema Basis (Refers From)**: [https://schema.org/BroadcastChannel](https://schema.org/BroadcastChannel)

---

## Upstream Schema Basis (Refers From) & Global Standards Provenance

This RobOS schema is modeled after and directly aligns with two levels of global standards:
- **Universal Schema.org Class**: [https://schema.org/BroadcastChannel](https://schema.org/BroadcastChannel) (100% interoperability with search engines, web indexers, and general AI reasoning)
- **Specialized Domain Standard**: [https://kafka.apache.org/documentation/#intro_concepts_and_terms](https://kafka.apache.org/documentation/#intro_concepts_and_terms) (de facto standard for domain-specific ALM, BDD, or infrastructure operations)
- **Canonical Reference**: [https://schema.org/BroadcastChannel](https://schema.org/BroadcastChannel)
- **Agent Guidelines**: When autonomous agents generate, expand, or validate instances of `robos:MessageTopic`, they MUST adhere to and base their output on this referred schema object and universal Schema.org parent class, extending it with RobOS SDLC properties.

---

## Entity Relationship & Schema Context

<div style="margin: 1.5rem 0; padding: 1.25rem; background: #161b22; border: 1px solid #30363d; border-radius: 8px;">
  <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.75rem; flex-wrap: wrap; gap: 0.5rem;">
    <span style="font-size: 1.15rem; font-weight: 700; color: #38bdf8;">Message Topic</span>
    <span style="font-family: monospace; background: #121927; color: #00e5ff; border: 1px solid rgba(0, 229, 255, 0.4); padding: 0.2rem 0.6rem; border-radius: 6px; font-size: 0.85rem;">robos:MessageTopic</span>
  </div>
  <p style="margin-bottom: 0.75rem; font-size: 0.92rem; color: #c9d1d9;">Governed by W3C SHACL shape <code>urn:robos:shape:MessageTopicShape</code> within the <strong>Core Platform (robos.core)</strong> (<code>robos.platform</code>) package store.</p>
  <div style="display: flex; flex-wrap: wrap; gap: 0.5rem; margin-top: 0.5rem;">
    <span style="background: #0d1117; border: 1px solid #21262d; padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.8rem; color: #8b949e;"><code>dcterms:title</code></span>
    <span style="background: #0d1117; border: 1px solid #21262d; padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.8rem; color: #8b949e;"><code>robos:topicName</code></span>
    <span style="background: #0d1117; border: 1px solid #21262d; padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.8rem; color: #8b949e;"><code>robos:broker</code></span>
  </div>
</div>

---

**RobOS classification:** Data stores & messaging. These RobOS-owned codes use Schema.org CategoryCode vocabulary.

## Property Constraints & SHACL Rules

| Property Path | Name | Multiplicity | Data Type | Classification | Constraint Rule / Validation Message |
|---|---|---|---|---|---|
| **`dcterms:title`** | Title / Display Name | `1..*` | `xsd:string` | Services & processing, Applications & entry points, Contracts & data models, Data stores & messaging, Libraries & build systems, Infrastructure & delivery, Organization & people, Projects & work items, Source control & artifacts, Agents & MCP, Documentation & decisions, Learning & assessment, Testing & behavior | Message Topic must have a title. |
| **`robos:topicName`** | Topic / Queue Name | `1..*` | `xsd:string` | Data stores & messaging | Message Topic must specify topic name. |
| **`robos:broker`** | Parent Message Broker | `1..*` | `URI (robos:MessageBroker)` | Data stores & messaging | Message Topic must link to parent message broker. |

---

## Canonical OSLC JSON-LD Example

```json
{
  "@id": "urn:robos:core-platform:message-topic-sample",
  "@type": [
    "robos:MessageTopic",
    "robos:MessageQueue",
    "robos:EventTopic",
    "schema:BroadcastChannel",
    "oslc:Resource"
  ],
  "dcterms:title": "Sample Message Topic",
  "dcterms:description": "Canonical reference instance for robos:MessageTopic.",
  "robos:package": "core-platform",
  "robos:namespace": "robos.platform",
  "robos:topicName": "sample-events-v1",
  "robos:broker": "urn:robos:broker:acme-kafka",
  "robos:schemaOrgType": "https://schema.org/BroadcastChannel",
  "robos:domainStandard": "https://kafka.apache.org/documentation/#intro_concepts_and_terms",
  "robos:refersFrom": "https://schema.org/BroadcastChannel"
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
        "@id": "urn:robos:core-platform:message-topic-sample",
        "@type": [
            "robos:MessageTopic",
            "robos:MessageQueue",
            "robos:EventTopic",
            "schema:BroadcastChannel",
            "oslc:Resource"
        ],
        "dcterms:title": "Sample Message Topic",
        "dcterms:description": "Canonical reference instance for robos:MessageTopic.",
        "robos:package": "core-platform",
        "robos:namespace": "robos.platform",
        "robos:topicName": "sample-events-v1",
        "robos:broker": "urn:robos:broker:acme-kafka",
        "robos:schemaOrgType": "https://schema.org/BroadcastChannel",
        "robos:domainStandard": "https://kafka.apache.org/documentation/#intro_concepts_and_terms",
        "robos:refersFrom": "https://schema.org/BroadcastChannel"
    }
  ],
}));

console.log("Conforms:", result.conforms); // Expected: true
```