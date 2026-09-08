---
title: Kubernetes Namespace
layout: default
parent: DevOps & Cloud (robos.devops)
grand_parent: KGraph Schemas
nav_order: 7
permalink: /schemas/devops/kubernetes-namespace.html
---

# Schema: `robos:KubernetesNamespace`
{: .no_toc }

Formal W3C SHACL constraint shape and OSLC JSON-LD specification for `robos:KubernetesNamespace` in the `devops` package store.
{: .fs-6 .fw-300 }

## Table of contents
{: .no_toc .text-delta }

1. TOC
{:toc}

---

## Specification Metadata

- **RDF / OWL Class**: `robos:KubernetesNamespace`
- **Aliases / Target Classes**: `robos:KubernetesNamespace`
- **SHACL Shape ID**: `urn:robos:shape:KubernetesNamespaceShape`
- **Governing Package**: [DevOps & Cloud (robos.devops)]({{ '/schemas/devops.html' | relative_url }}) (`devops`)
- **Namespace**: `robos.devops`

---

## Entity Relationship & Schema Context

<div style="margin: 1.5rem 0; padding: 1.25rem; background: #161b22; border: 1px solid #30363d; border-radius: 8px;">
  <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.75rem; flex-wrap: wrap; gap: 0.5rem;">
    <span style="font-size: 1.15rem; font-weight: 700; color: #38bdf8;">Kubernetes Namespace</span>
    <span style="font-family: monospace; background: #121927; color: #00e5ff; border: 1px solid rgba(0, 229, 255, 0.4); padding: 0.2rem 0.6rem; border-radius: 6px; font-size: 0.85rem;">robos:KubernetesNamespace</span>
  </div>
  <p style="margin-bottom: 0.75rem; font-size: 0.92rem; color: #c9d1d9;">Governed by W3C SHACL shape <code>urn:robos:shape:KubernetesNamespaceShape</code> within the <strong>DevOps & Cloud (robos.devops)</strong> (<code>robos.devops</code>) package store.</p>
  <div style="display: flex; flex-wrap: wrap; gap: 0.5rem; margin-top: 0.5rem;">
    <span style="background: #0d1117; border: 1px solid #21262d; padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.8rem; color: #8b949e;"><code>dcterms:title</code></span>
    <span style="background: #0d1117; border: 1px solid #21262d; padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.8rem; color: #8b949e;"><code>robos:namespaceName</code></span>
    <span style="background: #0d1117; border: 1px solid #21262d; padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.8rem; color: #8b949e;"><code>robos:cluster</code></span>
  </div>
</div>

---

## Property Constraints & SHACL Rules

| Property Path | Name | Multiplicity | Data Type | Constraint Rule / Validation Message |
|---|---|---|---|---|
| **`dcterms:title`** | Title / Display Name | `1..*` | `xsd:string` | Kubernetes Namespace must have a title. |
| **`robos:namespaceName`** | Kubernetes Namespace Name | `1..*` | `xsd:string` | Kubernetes Namespace must specify namespace name. |
| **`robos:cluster`** | Target Kubernetes Cluster | `1..*` | `URI (robos:KubernetesCluster)` | Kubernetes Namespace must link to parent cluster. |

---

## Canonical OSLC JSON-LD Example

```json
{
  "@id": "urn:robos:devops:kubernetes-namespace-sample",
  "@type": [
    "robos:KubernetesNamespace",
    "oslc:Resource"
  ],
  "dcterms:title": "Sample Kubernetes Namespace",
  "dcterms:description": "Canonical reference instance for robos:KubernetesNamespace.",
  "robos:package": "devops",
  "robos:namespace": "robos.devops",
  "robos:namespaceName": "sample-namespace",
  "robos:cluster": "urn:robos:cluster:prod-us-east-eks"
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
        "@id": "urn:robos:devops:kubernetes-namespace-sample",
        "@type": [
            "robos:KubernetesNamespace",
            "oslc:Resource"
        ],
        "dcterms:title": "Sample Kubernetes Namespace",
        "dcterms:description": "Canonical reference instance for robos:KubernetesNamespace.",
        "robos:package": "devops",
        "robos:namespace": "robos.devops",
        "robos:namespaceName": "sample-namespace",
        "robos:cluster": "urn:robos:cluster:prod-us-east-eks"
    }
  ],
}));

console.log("Conforms:", result.conforms); // Expected: true
```