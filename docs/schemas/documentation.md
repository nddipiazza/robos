---
title: Documentation & Diagrams (robos.docs)
layout: default
parent: KGraph Schemas
nav_order: 7
has_children: true
permalink: /schemas/documentation.html
---

# Documentation & Diagrams (robos.docs)
{: .no_toc }

Living documentation pages, architecture decision records (ADRs), interactive walkthroughs, and visual flow diagrams with AI illustrations.
{: .fs-6 .fw-300 }

## Table of contents
{: .no_toc .text-delta }

1. TOC
{:toc}

---

## Package Metadata

- **Package Store ID**: `documentation`
- **Ontology Namespace**: `robos.docs`
- **GitOps Package File**: `.robos/kgraphs/documentation/package.jsonld`
- **Schemas Defined**: 7

---

## Package Schemas & Constraint Shapes

| Schema Class | Target Shape URI | Required Properties (minCount ≥ 1) | Specification |
|---|---|---|---|
| [**Flow Diagram** (`robos:FlowDiagram`)]({{ '/schemas/documentation/flow-diagram.html' | relative_url }}) | `urn:robos:shape:FlowDiagramShape` | `dcterms:title`, `dcterms:description`, `robos:mermaidText`, `robos:imagePath`, `robos:tooltip` | [View Schema &rarr;]({{ '/schemas/documentation/flow-diagram.html' | relative_url }}) |
| [**Documentation Page** (`robos:DocumentationPage`)]({{ '/schemas/documentation/documentation-page.html' | relative_url }}) | `urn:robos:shape:DocumentationPageShape` | `dcterms:title`, `robos:slug`, `robos:docPath` | [View Schema &rarr;]({{ '/schemas/documentation/documentation-page.html' | relative_url }}) |
| [**Architecture Decision Record** (`robos:ArchitectureDecisionRecord`)]({{ '/schemas/documentation/architecture-decision-record.html' | relative_url }}) | `urn:robos:shape:ArchitectureDecisionRecordShape` | `dcterms:title`, `robos:status`, `robos:context`, `robos:decision` | [View Schema &rarr;]({{ '/schemas/documentation/architecture-decision-record.html' | relative_url }}) |
| [**Interactive Walkthrough** (`robos:InteractiveWalkthrough`)]({{ '/schemas/documentation/interactive-walkthrough.html' | relative_url }}) | `urn:robos:shape:InteractiveWalkthroughShape` | `dcterms:title`, `robos:slug`, `robos:targetApp` | [View Schema &rarr;]({{ '/schemas/documentation/interactive-walkthrough.html' | relative_url }}) |
| [**Code Snippet** (`robos:CodeSnippet`)]({{ '/schemas/documentation/code-snippet.html' | relative_url }}) | `urn:robos:shape:CodeSnippetShape` | `dcterms:title`, `robos:language`, `robos:code` | [View Schema &rarr;]({{ '/schemas/documentation/code-snippet.html' | relative_url }}) |
| [**Doc Section** (`robos:DocSection`)]({{ '/schemas/documentation/doc-section.html' | relative_url }}) | `urn:robos:shape:DocSectionShape` | `dcterms:title`, `robos:sectionId`, `robos:docPage` | [View Schema &rarr;]({{ '/schemas/documentation/doc-section.html' | relative_url }}) |
| [**ADR Option** (`robos:ADROption`)]({{ '/schemas/documentation/adr-option.html' | relative_url }}) | `urn:robos:shape:ADROptionShape` | `dcterms:title`, `robos:adr` | [View Schema &rarr;]({{ '/schemas/documentation/adr-option.html' | relative_url }}) |

---

## Package Architecture & Linked Data Model

<div style="margin: 2rem 0; border: 1px solid #1e293b; border-radius: 12px; overflow: hidden; background: #0b101b; box-shadow: 0 10px 40px rgba(0,0,0,0.6);">
  <img src="{{ '/assets/images/kgraph-schemas-architecture.jpg' | relative_url }}" alt="Documentation & Diagrams (robos.docs) Ontology Map" class="robos-zoomable-img" style="display: block; width: 100%; height: auto;" />
  <div style="padding: 0.75rem 1.25rem; font-size: 0.85rem; color: #94a3b8; border-top: 1px solid #1e293b; background: #0d1424; text-align: center;">
    <strong>Documentation & Diagrams (robos.docs) (robos.docs)</strong>: High-level package ontology within the RobOS Knowledge Graph. <em>(Click image to zoom full screen)</em>
  </div>
</div>