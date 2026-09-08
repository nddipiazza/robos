---
title: Applications (robos.apps)
layout: default
parent: KGraph Schemas
nav_order: 4
has_children: true
permalink: /schemas/applications.html
---

# Applications (robos.apps)
{: .no_toc }

Front-end SPAs, desktop workstations, PC & mobile games, mobile apps, and CLI tools.
{: .fs-6 .fw-300 }

## Table of contents
{: .no_toc .text-delta }

1. TOC
{:toc}

---

## Package Metadata

- **Package Store ID**: `applications`
- **Ontology Namespace**: `robos.apps`
- **GitOps Package File**: `.robos/kgraphs/applications/package.jsonld`
- **Schemas Defined**: 10

---

## Package Schemas & Constraint Shapes

| Schema Class | Target Shape URI | Required Properties (minCount ≥ 1) | Specification |
|---|---|---|---|
| [**Desktop App** (`robos:DesktopApp`)]({{ '/schemas/applications/desktop-app.html' | relative_url }}) | `urn:robos:shape:DesktopAppShape` | `dcterms:title`, `robos:repository`, `robos:technology`, `robos:desktopFramework` | [View Schema &rarr;]({{ '/schemas/applications/desktop-app.html' | relative_url }}) |
| [**Console App** (`robos:ConsoleApp`)]({{ '/schemas/applications/console-app.html' | relative_url }}) | `urn:robos:shape:ConsoleAppShape` | `dcterms:title`, `robos:repository`, `robos:technology`, `robos:cliCommand` | [View Schema &rarr;]({{ '/schemas/applications/console-app.html' | relative_url }}) |
| [**Mobile App** (`robos:MobileApp`)]({{ '/schemas/applications/mobile-app.html' | relative_url }}) | `urn:robos:shape:MobileAppShape` | `dcterms:title`, `robos:repository`, `robos:technology`, `robos:platform` | [View Schema &rarr;]({{ '/schemas/applications/mobile-app.html' | relative_url }}) |
| [**Library** (`robos:Library`)]({{ '/schemas/applications/library.html' | relative_url }}) | `urn:robos:shape:LibraryShape` | `dcterms:title`, `robos:repository`, `robos:technology` | [View Schema &rarr;]({{ '/schemas/applications/library.html' | relative_url }}) |
| [**Front End App** (`robos:FrontEndApp`)]({{ '/schemas/applications/front-end-app.html' | relative_url }}) | `urn:robos:shape:FrontEndAppShape` | `dcterms:title`, `robos:repository`, `robos:technology`, `robos:frontendFramework` | [View Schema &rarr;]({{ '/schemas/applications/front-end-app.html' | relative_url }}) |
| [**PC Game** (`robos:PCGame`)]({{ '/schemas/applications/pc-game.html' | relative_url }}) | `urn:robos:shape:PCGameShape` | `dcterms:title`, `robos:repository`, `robos:technology`, `robos:gameEngine`, `robos:targetPlatform` | [View Schema &rarr;]({{ '/schemas/applications/pc-game.html' | relative_url }}) |
| [**Mobile Game** (`robos:MobileGame`)]({{ '/schemas/applications/mobile-game.html' | relative_url }}) | `urn:robos:shape:MobileGameShape` | `dcterms:title`, `robos:repository`, `robos:technology`, `robos:gameEngine`, `robos:platform` | [View Schema &rarr;]({{ '/schemas/applications/mobile-game.html' | relative_url }}) |
| [**Web Route** (`robos:WebRoute`)]({{ '/schemas/applications/web-route.html' | relative_url }}) | `urn:robos:shape:WebRouteShape` | `dcterms:title`, `robos:routePath`, `robos:app` | [View Schema &rarr;]({{ '/schemas/applications/web-route.html' | relative_url }}) |
| [**CLI Command** (`robos:CLICommand`)]({{ '/schemas/applications/cli-command.html' | relative_url }}) | `urn:robos:shape:CLICommandShape` | `dcterms:title`, `robos:commandName`, `robos:app` | [View Schema &rarr;]({{ '/schemas/applications/cli-command.html' | relative_url }}) |
| [**CLI Flag** (`robos:CLIFlag`)]({{ '/schemas/applications/cli-flag.html' | relative_url }}) | `urn:robos:shape:CLIFlagShape` | `dcterms:title`, `robos:flagName`, `robos:command` | [View Schema &rarr;]({{ '/schemas/applications/cli-flag.html' | relative_url }}) |

---

## Package Architecture & Linked Data Model

<div style="margin: 2rem 0; border: 1px solid #1e293b; border-radius: 12px; overflow: hidden; background: #0b101b; box-shadow: 0 10px 40px rgba(0,0,0,0.6);">
  <img src="{{ '/assets/images/kgraph-schemas-architecture.jpg' | relative_url }}" alt="Applications (robos.apps) Ontology Map" class="robos-zoomable-img" style="display: block; width: 100%; height: auto;" />
  <div style="padding: 0.75rem 1.25rem; font-size: 0.85rem; color: #94a3b8; border-top: 1px solid #1e293b; background: #0d1424; text-align: center;">
    <strong>Applications (robos.apps) (robos.apps)</strong>: High-level package ontology within the RobOS Knowledge Graph. <em>(Click image to zoom full screen)</em>
  </div>
</div>