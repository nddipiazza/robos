---
title: "Documentation & Diagrams (robos.docs)"
layout: default
parent: Schemas
nav_order: 7
has_children: true
permalink: /schemas/documentation.html
---

# Documentation & Diagrams (robos.docs)
{: .no_toc }

Documentation pages, architecture decision records, flow diagrams, walkthroughs and code snippets.
{: .fs-6 }

| | |
|---|---|
| Package id | `documentation` |
| Namespace | `robos.docs` |
| Package file | `.robos/kgraphs/documentation/package.jsonld` |
| Classes documented | 8 |

## Classes

Required properties are the ones with a minimum count of 1 or more. A node that lacks one fails validation.

| Class | Shape | Required properties |
|---|---|---|
| [Flow Diagram (`robos:FlowDiagram`)]({{ '/schemas/documentation/flow-diagram.html' | relative_url }}) | `urn:robos:shape:FlowDiagramShape` | `dcterms:title`, `dcterms:description`, `robos:mermaidText`, `robos:imagePath`, `robos:tooltip` |
| [Documentation (`robos:Documentation`)]({{ '/schemas/documentation/documentation.html' | relative_url }}) | `urn:robos:shape:DocumentationShape` | `dcterms:title`, `robos:targetEntity`, `robos:docPath`, `robos:gitopsFile` |
| [Documentation Page (`robos:DocumentationPage`)]({{ '/schemas/documentation/documentation-page.html' | relative_url }}) | `urn:robos:shape:DocumentationPageShape` | `dcterms:title`, `robos:slug`, `robos:docPath` |
| [Architecture Decision Record (`robos:ArchitectureDecisionRecord`)]({{ '/schemas/documentation/architecture-decision-record.html' | relative_url }}) | `urn:robos:shape:ArchitectureDecisionRecordShape` | `dcterms:title`, `robos:status`, `robos:context`, `robos:decision` |
| [Interactive Walkthrough (`robos:InteractiveWalkthrough`)]({{ '/schemas/documentation/interactive-walkthrough.html' | relative_url }}) | `urn:robos:shape:InteractiveWalkthroughShape` | `dcterms:title`, `robos:slug`, `robos:targetApp` |
| [Code Snippet (`robos:CodeSnippet`)]({{ '/schemas/documentation/code-snippet.html' | relative_url }}) | `urn:robos:shape:CodeSnippetShape` | `dcterms:title`, `robos:language`, `robos:code` |
| [Doc Section (`robos:DocSection`)]({{ '/schemas/documentation/doc-section.html' | relative_url }}) | `urn:robos:shape:DocSectionShape` | `dcterms:title`, `robos:sectionId`, `robos:docPage` |
| [ADR Option (`robos:ADROption`)]({{ '/schemas/documentation/adr-option.html' | relative_url }}) | `urn:robos:shape:ADROptionShape` | `dcterms:title`, `robos:adr` |
