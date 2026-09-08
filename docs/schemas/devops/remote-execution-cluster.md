---
title: Remote Execution Cluster
layout: default
parent: DevOps & Cloud (robos.devops)
grand_parent: KGraph Schemas
nav_order: 2
permalink: /schemas/devops/remote-execution-cluster.html
---

# Schema: `robos:RemoteExecutionCluster`
{: .no_toc }

Formal W3C SHACL constraint shape and OSLC JSON-LD specification for `robos:RemoteExecutionCluster` in the `devops` package store.
{: .fs-6 .fw-300 }

## Table of contents
{: .no_toc .text-delta }

1. TOC
{:toc}

---

## Specification Metadata

- **RDF / OWL Class**: `robos:RemoteExecutionCluster`
- **Aliases / Target Classes**: `robos:RemoteExecutionCluster`, `robos:RemoteBuildCluster`
- **SHACL Shape ID**: `urn:robos:shape:RemoteExecutionClusterShape`
- **Governing Package**: [DevOps & Cloud (robos.devops)]({{ '/schemas/devops.html' | relative_url }}) (`devops`)
- **Namespace**: `robos.devops`
- **Upstream Schema Basis (Refers From)**: [https://schema.org/ComputerPlatform](https://schema.org/ComputerPlatform)

---

## Upstream Schema Basis (Refers From)

This RobOS schema is modeled after and directly expands upon the upstream canonical standard:
- **Canonical Reference**: [https://schema.org/ComputerPlatform](https://schema.org/ComputerPlatform)
- **Provenance & Alignment**: When autonomous agents generate, expand, or validate instances of `robos:RemoteExecutionCluster`, they MUST adhere to and base their output on this referred schema object, extending it with RobOS SDLC properties.

---

## Entity Relationship & Schema Context

<div style="margin: 1.5rem 0; padding: 1.25rem; background: #161b22; border: 1px solid #30363d; border-radius: 8px;">
  <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.75rem; flex-wrap: wrap; gap: 0.5rem;">
    <span style="font-size: 1.15rem; font-weight: 700; color: #38bdf8;">Remote Execution Cluster</span>
    <span style="font-family: monospace; background: #121927; color: #00e5ff; border: 1px solid rgba(0, 229, 255, 0.4); padding: 0.2rem 0.6rem; border-radius: 6px; font-size: 0.85rem;">robos:RemoteExecutionCluster</span>
  </div>
  <p style="margin-bottom: 0.75rem; font-size: 0.92rem; color: #c9d1d9;">Governed by W3C SHACL shape <code>urn:robos:shape:RemoteExecutionClusterShape</code> within the <strong>DevOps & Cloud (robos.devops)</strong> (<code>robos.devops</code>) package store.</p>
  <div style="display: flex; flex-wrap: wrap; gap: 0.5rem; margin-top: 0.5rem;">
    <span style="background: #0d1117; border: 1px solid #21262d; padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.8rem; color: #8b949e;"><code>dcterms:title</code></span>
    <span style="background: #0d1117; border: 1px solid #21262d; padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.8rem; color: #8b949e;"><code>robos:protocol</code></span>
    <span style="background: #0d1117; border: 1px solid #21262d; padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.8rem; color: #8b949e;"><code>robos:provider</code></span>
    <span style="background: #0d1117; border: 1px solid #21262d; padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.8rem; color: #8b949e;"><code>robos:executionEndpoint</code></span>
    <span style="background: #0d1117; border: 1px solid #21262d; padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.8rem; color: #8b949e;"><code>robos:casEndpoint</code></span>
  </div>
</div>

---

## Property Constraints & SHACL Rules

| Property Path | Name | Multiplicity | Data Type | Constraint Rule / Validation Message |
|---|---|---|---|---|
| **`dcterms:title`** | Title / Display Name | `1..*` | `xsd:string` | Remote Execution Cluster must have a title. |
| **`robos:protocol`** | Protocol / Standard | `1..*` | `xsd:string` | Remote Execution Cluster must declare protocol standard (e.g. REAPI_v2). |
| **`robos:provider`** | Backend Provider | `1..*` | `xsd:string` | Remote Execution Cluster must declare backend provider engine (e.g. buildbarn, nativelink, buildgrid). |
| **`robos:executionEndpoint`** | Execution Endpoint | `1..*` | `xsd:anyURI` | Remote Execution Cluster must specify execution endpoint URI. |
| **`robos:casEndpoint`** | CAS Endpoint | `1..*` | `xsd:anyURI` | Remote Execution Cluster must specify Content Addressable Storage (CAS) endpoint URI. |

---

## Canonical OSLC JSON-LD Example

```json
{
  "@id": "urn:robos:remote-execution:acme-buildbarn-cluster",
  "@type": [
    "robos:RemoteExecutionCluster",
    "robos:RemoteBuildCluster",
    "oslc:Resource"
  ],
  "dcterms:title": "Acme Production Buildbarn REAPI Cluster",
  "dcterms:description": "High-performance distributed remote execution & CAS caching cluster using Buildbarn suite.",
  "robos:protocol": "REAPI_v2",
  "robos:provider": "buildbarn",
  "robos:instanceName": "main",
  "robos:executionEndpoint": "grpc://re-execution.buildbarn.internal:8980",
  "robos:casEndpoint": "grpc://re-cas.buildbarn.internal:8980",
  "robos:actionCacheEndpoint": "grpc://re-cas.buildbarn.internal:8980",
  "robos:browserEndpoint": "http://re-browser.buildbarn.internal:7984",
  "robos:tlsEnabled": false,
  "robos:status": "active",
  "robos:workerPools": [
    {
      "name": "linux-x86_64-large",
      "osFamily": "linux",
      "isa": "x86-64",
      "containerImage": "docker://gcr.io/cloud-marketplace/google/debian11:latest",
      "concurrency": 64
    }
  ],
  "robos:cacheSettings": {
    "maxSizeBytes": "500GB",
    "retentionDays": 14,
    "evictionPolicy": "lru"
  },
  "robos:package": "devops",
  "robos:namespace": "robos.devops"
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
        "@id": "urn:robos:remote-execution:acme-buildbarn-cluster",
        "@type": [
            "robos:RemoteExecutionCluster",
            "robos:RemoteBuildCluster",
            "oslc:Resource"
        ],
        "dcterms:title": "Acme Production Buildbarn REAPI Cluster",
        "dcterms:description": "High-performance distributed remote execution & CAS caching cluster using Buildbarn suite.",
        "robos:protocol": "REAPI_v2",
        "robos:provider": "buildbarn",
        "robos:instanceName": "main",
        "robos:executionEndpoint": "grpc://re-execution.buildbarn.internal:8980",
        "robos:casEndpoint": "grpc://re-cas.buildbarn.internal:8980",
        "robos:actionCacheEndpoint": "grpc://re-cas.buildbarn.internal:8980",
        "robos:browserEndpoint": "http://re-browser.buildbarn.internal:7984",
        "robos:tlsEnabled": false,
        "robos:status": "active",
        "robos:workerPools": [
            {
                "name": "linux-x86_64-large",
                "osFamily": "linux",
                "isa": "x86-64",
                "containerImage": "docker://gcr.io/cloud-marketplace/google/debian11:latest",
                "concurrency": 64
            }
        ],
        "robos:cacheSettings": {
            "maxSizeBytes": "500GB",
            "retentionDays": 14,
            "evictionPolicy": "lru"
        },
        "robos:package": "devops",
        "robos:namespace": "robos.devops"
    }
  ],
}));

console.log("Conforms:", result.conforms); // Expected: true
```