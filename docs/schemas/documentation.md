---
title: "Documentation & Diagrams"
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

| Detail | Value |
|---|---|
| Package id | `documentation` |
| Namespace | `robos.docs` |
| Package file | `.robos/kgraphs/documentation/package.jsonld` |
| Classes documented | 8 |

## Classes

Required properties are the ones with a minimum count of 1 or more. A node that lacks one fails validation.

| Class | Node type | Required properties |
|---|---|---|
| [Flow Diagram]({{ '/schemas/documentation/flow-diagram.html' | relative_url }}) | `robos:FlowDiagram` | `dcterms:title`, `dcterms:description`, `robos:mermaidText`, `robos:imagePath`, `robos:tooltip` |
| [Documentation]({{ '/schemas/documentation/documentation.html' | relative_url }}) | `robos:Documentation` | `dcterms:title`, `robos:targetEntity`, `robos:docPath`, `robos:gitopsFile` |
| [Documentation Page]({{ '/schemas/documentation/documentation-page.html' | relative_url }}) | `robos:DocumentationPage` | `dcterms:title`, `robos:slug`, `robos:docPath` |
| [Architecture Decision Record]({{ '/schemas/documentation/architecture-decision-record.html' | relative_url }}) | `robos:ArchitectureDecisionRecord` | `dcterms:title`, `robos:status`, `robos:context`, `robos:decision` |
| [Interactive Walkthrough]({{ '/schemas/documentation/interactive-walkthrough.html' | relative_url }}) | `robos:InteractiveWalkthrough` | `dcterms:title`, `robos:slug`, `robos:targetApp` |
| [Code Snippet]({{ '/schemas/documentation/code-snippet.html' | relative_url }}) | `robos:CodeSnippet` | `dcterms:title`, `robos:language`, `robos:code` |
| [Doc Section]({{ '/schemas/documentation/doc-section.html' | relative_url }}) | `robos:DocSection` | `dcterms:title`, `robos:sectionId`, `robos:docPage` |
| [ADR Option]({{ '/schemas/documentation/adr-option.html' | relative_url }}) | `robos:ADROption` | `dcterms:title`, `robos:adr` |
