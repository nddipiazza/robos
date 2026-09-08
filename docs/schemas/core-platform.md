---
title: Core Platform (robos.core)
layout: default
parent: KGraph Schemas
nav_order: 1
has_children: true
permalink: /schemas/core-platform.html
---

# Core Platform (robos.core)
{: .no_toc }

Foundational architectural graph, system roots, and platform configuration.
{: .fs-6 .fw-300 }

## Table of contents
{: .no_toc .text-delta }

1. TOC
{:toc}

---

## Package Metadata

- **Package Store ID**: `core-platform`
- **Ontology Namespace**: `robos.platform`
- **GitOps Package File**: `.robos/kgraphs/core-platform/package.jsonld`
- **Schemas Defined**: 3

---

## Package Schemas & Constraint Shapes

| Schema Class | Target Shape URI | Required Properties (minCount ≥ 1) | Specification |
|---|---|---|---|
| [**Project** (`robos:Project`)]({{ '/schemas/core-platform/project.html' | relative_url }}) | `urn:robos:shape:ProjectShape` | `dcterms:title`, `robos:status` | [View Schema &rarr;]({{ '/schemas/core-platform/project.html' | relative_url }}) |
| [**Epic** (`robos:Epic`)]({{ '/schemas/core-platform/epic.html' | relative_url }}) | `urn:robos:shape:EpicShape` | `dcterms:title` | [View Schema &rarr;]({{ '/schemas/core-platform/epic.html' | relative_url }}) |
| [**Build System** (`robos:BuildSystem`)]({{ '/schemas/core-platform/build-system.html' | relative_url }}) | `urn:robos:shape:BuildSystemShape` | `dcterms:title`, `robos:buildTool`, `robos:configFile` | [View Schema &rarr;]({{ '/schemas/core-platform/build-system.html' | relative_url }}) |

---

## Package Architecture & Linked Data Model

<div style="margin: 2rem 0; border: 1px solid #1e293b; border-radius: 12px; overflow: hidden; background: #0b101b; box-shadow: 0 10px 40px rgba(0,0,0,0.6);">
  <img src="{{ '/assets/images/kgraph-schemas-architecture.jpg' | relative_url }}" alt="Core Platform (robos.core) Ontology Map" class="robos-zoomable-img" style="display: block; width: 100%; height: auto;" />
  <div style="padding: 0.75rem 1.25rem; font-size: 0.85rem; color: #94a3b8; border-top: 1px solid #1e293b; background: #0d1424; text-align: center;">
    <strong>Core Platform (robos.core) (robos.platform)</strong>: High-level package ontology within the RobOS Knowledge Graph. <em>(Click image to zoom full screen)</em>
  </div>
</div>