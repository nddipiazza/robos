---
title: DevOps & Cloud (robos.devops)
layout: default
parent: KGraph Schemas
nav_order: 5
has_children: true
permalink: /schemas/devops.html
---

# DevOps & Cloud (robos.devops)
{: .no_toc }

Cloud providers, CI/CD pipelines, container registries, OAuth apps, DNS domains, and secure GPG pass credentials.
{: .fs-6 .fw-300 }

## Table of contents
{: .no_toc .text-delta }

1. TOC
{:toc}

---

## Package Metadata

- **Package Store ID**: `devops`
- **Ontology Namespace**: `robos.devops`
- **GitOps Package File**: `.robos/kgraphs/devops/package.jsonld`
- **Schemas Defined**: 1

---

## Package Schemas & Constraint Shapes

| Schema Class | Target Shape URI | Required Properties (minCount ≥ 1) | Specification |
|---|---|---|---|
| [**Remote Execution Cluster** (`robos:RemoteExecutionCluster`)]({{ '/schemas/devops/remote-execution-cluster.html' | relative_url }}) | `urn:robos:shape:RemoteExecutionClusterShape` | `dcterms:title`, `robos:protocol`, `robos:provider`, `robos:executionEndpoint`, `robos:casEndpoint` | [View Schema &rarr;]({{ '/schemas/devops/remote-execution-cluster.html' | relative_url }}) |

---

## Package Architecture & Linked Data Model

<div style="margin: 2rem 0; border: 1px solid #1e293b; border-radius: 12px; overflow: hidden; background: #0b101b; box-shadow: 0 10px 40px rgba(0,0,0,0.6);">
  <img src="{{ '/assets/images/kgraph-schemas-architecture.jpg' | relative_url }}" alt="DevOps & Cloud (robos.devops) Ontology Map" class="robos-zoomable-img" style="display: block; width: 100%; height: auto;" />
  <div style="padding: 0.75rem 1.25rem; font-size: 0.85rem; color: #94a3b8; border-top: 1px solid #1e293b; background: #0d1424; text-align: center;">
    <strong>DevOps & Cloud (robos.devops) (robos.devops)</strong>: High-level package ontology within the RobOS Knowledge Graph. <em>(Click image to zoom full screen)</em>
  </div>
</div>