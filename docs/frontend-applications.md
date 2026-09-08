---
title: Front End Applications
layout: default
nav_order: 14
---

# Front End Applications
{: .no_toc }

<div style="margin-top: -0.5rem; margin-bottom: 1.25rem; display: flex; align-items: center; gap: 0.75rem;">
  <span style="font-family: 'Fira Code', monospace; font-size: 1.15rem; color: #00e5ff; background: #162032; padding: 0.25rem 0.65rem; border-radius: 6px; border: 1px solid rgba(0, 229, 255, 0.35); font-weight: 600;">robos:FrontEndApp</span>
  <span class="label label-blue">SDLC Archetype</span>
</div>

Architect, scaffold, and verify modern single-page (SPA) and server-side rendered (SSR) web applications in RobOS aligned with Schema.org `schema:WebApplication`.
{: .fs-6 .fw-300 }

## Table of contents
{: .no_toc .text-delta }

1. TOC
{:toc}

---

## Overview

In the RobOS Knowledge Graph, **Front End Applications** represent browser-based web applications that deliver rich interactive user interfaces for end users, internal operators, and customer portals.

Following open linked-data standards, Front End Applications are co-typed with:
- **`robos:FrontEndApp`**: RobOS SDLC core archetype namespace (`https://robos.dev/ns/sdlc#`).
- **`schema:WebApplication`**: [Schema.org WebApplication](https://schema.org/WebApplication), declaring browser requirements and web application properties.
- **`oslc_am:Resource`**: OASIS Open Services for Lifecycle Collaboration Architecture Management resource.
- **`c4:Container`**: C4 Model container representing an executable frontend deliverable.

---

## Supported Frameworks & Tooling

RobOS provides automated heuristic stack detection and scaffolding for modern frontend frameworks:
- **React 18 / 19** with **Vite** or **Next.js 14 / 15** (TypeScript)
- **Vue 3** with **Vite** and **Pinia**
- **SvelteKit** with **TypeScript**
- **Angular 18** with standalone components

---

## Schema & Properties

A Front End Application node in `.robos/knowledge-graph.jsonld` conforms to `urn:robos:shape:FrontEndAppShape`:

```json
{
  "@id": "urn:robos:frontend-app:petstore-web",
  "@type": [
    "robos:FrontEndApp",
    "schema:WebApplication",
    "oslc_am:Resource",
    "c4:Container"
  ],
  "dcterms:title": "Petstore Web Portal",
  "dcterms:description": "Modern single-page frontend web application for Petstore customer orders.",
  "robos:repository": "github.com/acme-org/petstore-web",
  "robos:technology": "React 18 / Vite / TypeScript",
  "robos:frontendFramework": "React",
  "robos:buildTool": "Vite",
  "robos:devServerPort": 3000,
  "schema:browserRequirements": "Requires HTML5 and modern evergreen browser with JavaScript enabled.",
  "robos:ownerTeam": "urn:robos:team:order-processing",
  "robos:hasProject": "urn:robos:project:acme-petshop"
}
```

### SHACL Constraints (`FrontEndAppShape`)
- **`dcterms:title`**: Application display title (minCount: 1)
- **`robos:repository`**: Canonical Git repository URL (minCount: 1)
- **`robos:technology`**: Runtime technology stack (minCount: 1)
- **`robos:frontendFramework`**: UI framework (React, Vue, Next.js, Angular, Svelte) (minCount: 1)

---

## Scaffolding via RobOS App Wizard

To scaffold a new Front End Application:
1. Open the **RobOS App Wizard** (`packages/app-wizard`).
2. Select the **Front End Application** archetype (🌐).
3. Specify package slug, target framework, and dev server port.
4. Click **Generate Scaffolding** to produce `dev-setup.sh`, `catalog-info.yaml`, and Vite configuration.
