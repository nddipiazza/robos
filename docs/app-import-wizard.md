---
title: Existing App Import Wizard
layout: default
parent: Application Development
nav_order: 3
---

# Existing App Import Wizard
{: .no_toc }

How application developers import existing codebases and Git repositories into RobOS using the App Import Wizard: deep automated code inspection, heuristic archetype detection, Backstage `catalog-info.yaml` generation, `dev-setup.sh` synthesis, and Knowledge Graph mapping.
{: .fs-6 .fw-300 }

## Table of contents
{: .no_toc .text-delta }

1. TOC
{:toc}

---

## Overview: Bring Any Existing App Into RobOS

Most engineering teams have existing repositories that were built before adopting RobOS. Bringing these projects into RobOS should not require rewriting code, converting folder structures, or manually authoring dozens of metadata files.

The **RobOS App Import Wizard** (`packages/app-wizard` in import mode) automatically inspects existing codebases, extracts their capabilities and contracts, and integrates them into the RobOS ecosystem in seconds:

<div style="margin: 2rem 0; border: 1px solid #1e293b; border-radius: 12px; overflow: hidden; background: #0b101b; box-shadow: 0 10px 40px rgba(0,0,0,0.6);">
  <img src="{{ '/assets/images/enterprise-migration-architecture.jpg' | relative_url }}" alt="Existing App Import & Ingestion Pipeline" class="robos-zoomable-img" style="display: block; width: 100%; height: auto;" />
  <div style="padding: 0.75rem 1.25rem; font-size: 0.85rem; color: #94a3b8; border-top: 1px solid #1e293b; background: #0d1424; text-align: center;">
    <strong>Existing App Import & Ingestion Pipeline</strong>: How the App Import Wizard scans manifests, infers archetypes, synthesizes Backstage metadata and dev-setup scripts, and ingests repositories into the Knowledge Graph. <em>(Click image to zoom full screen)</em>
  </div>
</div>

---

## Deep Inspection & Archetype Detection Engine

When an existing project directory is provided, the inspection engine analyzes build files and dependency trees using heuristic detection rules:

### Manifest Scanning Rules:
- **`pom.xml` / `build.gradle`**:
  - Detects Java version (e.g., Java 17, Java 21).
  - Identifies Spring Boot, Quarkus, or Micronaut dependencies.
  - Classifies as `robos:Microservice`.
- **`package.json`**:
  - Scans dependencies:
    - If `electron` is present: classifies as `robos:DesktopApp`.
    - If `react-native` is present: classifies as `robos:MobileApp`.
    - If `express`, `fastify`, `koa`, or `nest`: classifies as `robos:Microservice`.
    - Otherwise: classifies as `robos:Library` or frontend client.
- **`go.mod`**:
  - Detects Go version.
  - Scans for Gin, Echo, or Chi (Microservice) or Cobra (ConsoleApp).
- **`Cargo.toml`**:
  - Scans for Tokio, Actix, or Axum (Microservice) or Clap (ConsoleApp).
- **`requirements.txt` / `pyproject.toml`**:
  - Scans for FastAPI, Flask, Django (Microservice) or Celery (DataPipeline).

### API Contract & Migration Extraction:
The engine also scans for:
- Existing OpenAPI / Swagger specifications (`openapi.yaml`, `swagger.json`).
- GraphQL schemas (`schema.graphql`).
- Protobuf RPC definitions (`*.proto`).
- Database migration directories (`db/migration`, Flyway, Liquibase, Prisma, Alembic).

---

## Interactive AI Prompt Refinement (`<robos-ai-textarea>`)

Automated heuristic detection is fast, but real-world enterprise codebases frequently have special architectural requirements or polyglot structures.

In **Panel 2: Deep Inspection Results**, RobOS equips developers with an interactive `<robos-ai-textarea>` prompt bar alongside direct editable controls:

<div style="margin: 2rem 0; border: 1px solid #1e293b; border-radius: 12px; overflow: hidden; background: #0b101b; box-shadow: 0 10px 40px rgba(0,0,0,0.6);">
  <img src="{{ '/assets/images/screenshots/import-app-ai-refinement_frame.png' | relative_url }}" alt="Deep Inspection and Interactive AI Prompt Refinement" class="robos-zoomable-img" style="display: block; width: 100%; height: auto;" />
  <div style="padding: 0.75rem 1.25rem; font-size: 0.85rem; color: #94a3b8; border-top: 1px solid #1e293b; background: #0d1424; text-align: center;">
    <strong>Interactive AI Prompt Refinement</strong>: Using <code>&lt;robos-ai-textarea&gt;</code> to tune detected archetypes, technology stacks, and team assignments in real time. <em>(Click image to zoom full screen)</em>
  </div>
</div>

Developers can type natural language instructions to immediately alter the detected parameters:
- *"Treat this as a Microservice using Spring Boot instead of a library"*
- *"Change the runtime stack to Node 20 with Fastify and TypeScript"*
- *"Assign this component to team core-platform with package slug auth-gateway"*

Clicking **Apply AI Refinement** (or directly modifying the form fields) updates the archetype, technology stack, package name, and team assignment in real time before generating any configuration files.

---

## Step-by-Step Heterogeneous Resource & Codebase Ingestion Workflow

The import workflow follows three streamlined panels powered by the **RobOS Knowledge Graph Resource Importer** (`KGraphResourceImporter`):

### 1. Step 1: What stuff are you importing?
Specify any combination of heterogeneous infrastructure resources to ingest into the dual-state SDLC Knowledge Graph:
- **Git Repositories & URLs**: Individual GitHub, GitLab, or Bitbucket repositories (`https://github.com/org/repo`).
- **Git Organizations & Forges**: Full GitHub organizations (`https://github.com/acme-payments`), importing member repositories, forge metadata, and organization-level agent rules.
- **Local Directories & Monorepos**: Local filesystem paths (`/home/user/app`), scanning codebase manifests, packages, and markdown ADRs (`docs/adr/*.md`).
- **Confluence Spaces & Wikis**: Confluence URLs (`https://confluence.acme.corp/display/ARCH`), extracting living documentation pages, Architecture Decision Records (ADRs), and interactive Mermaid flowcharts.
- **Databases & Event Streams**: Connection URIs for PostgreSQL, MySQL, Redis, MongoDB (`postgres://...`), and Apache Kafka clusters (`kafka.internal:9092`).
- **Cloud Infrastructure & MCP Servers**: Kubernetes clusters (EKS, GKE, AKS, K3s) and Model Context Protocol (MCP) server endpoints.
- **AI Prompt & Bulk Extractor**: Paste unstructured notes or natural language requests into `<robos-ai-textarea>` to extract and queue targets automatically.
- **Enterprise Sample Stack**: One-click preset loading a realistic enterprise stack for rapid exploration.

<div style="margin: 2rem 0; border: 1px solid #1e293b; border-radius: 12px; overflow: hidden; background: #0b101b; box-shadow: 0 10px 40px rgba(0,0,0,0.6);">
  <img src="{{ '/assets/images/screenshots/import-app-source-select_frame.png' | relative_url }}" alt="Step 1: What stuff are you importing?" class="robos-zoomable-img" style="display: block; width: 100%; height: auto;" />
  <div style="padding: 0.75rem 1.25rem; font-size: 0.85rem; color: #94a3b8; border-top: 1px solid #1e293b; background: #0d1424; text-align: center;">
    <strong>Step 1: What stuff are you importing?</strong>: Queue URL resources, local repositories, Confluence spaces, databases, Kafka streams, and use AI prompt extraction. <em>(Click image to zoom full screen)</em>
  </div>
</div>

### 2. Step 2: Inspection & Knowledge Graph Topology
The inspection engine scans local manifests and simultaneously executes the `KGraphResourceImporter` pipeline:
- **Topology Statistics**: Discovers all entities across 8 standard packages (Microservices, Git Organizations, Confluence Docs, ADRs, Flow Diagrams, OpenAPI/Protobuf contracts, Databases, and Kafka brokers).
- **100% W3C SHACL Shape Conformance**: Every discovered node is validated in real time against 98 SHACL constraint shapes.
- **Interactive AI Prompt Refinement**: Use the `<robos-ai-textarea>` prompt bar to tune detected archetypes, technology stacks, naming, or team mapping in seconds.

<div style="margin: 2rem 0; border: 1px solid #1e293b; border-radius: 12px; overflow: hidden; background: #0b101b; box-shadow: 0 10px 40px rgba(0,0,0,0.6);">
  <img src="{{ '/assets/images/screenshots/import-app-deep-inspection_frame.png' | relative_url }}" alt="Step 2: Inspection and Knowledge Graph Topology" class="robos-zoomable-img" style="display: block; width: 100%; height: auto;" />
  <div style="padding: 0.75rem 1.25rem; font-size: 0.85rem; color: #94a3b8; border-top: 1px solid #1e293b; background: #0d1424; text-align: center;">
    <strong>Step 2: Inspection & Knowledge Graph Topology</strong>: Discovered entities, modular package breakdown, W3C SHACL conformance, and interactive AI refinement. <em>(Click image to zoom full screen)</em>
  </div>
</div>

<div style="margin: 2rem 0; border: 1px solid #1e293b; border-radius: 12px; overflow: hidden; background: #0b101b; box-shadow: 0 10px 40px rgba(0,0,0,0.6);">
  <img src="{{ '/assets/images/screenshots/import-app-ai-refinement_frame.png' | relative_url }}" alt="Step 2: AI Prompt Refinement Applied" class="robos-zoomable-img" style="display: block; width: 100%; height: auto;" />
  <div style="padding: 0.75rem 1.25rem; font-size: 0.85rem; color: #94a3b8; border-top: 1px solid #1e293b; background: #0d1424; text-align: center;">
    <strong>Step 2 (Continued): AI Prompt Refinement</strong>: Instructing AI in natural language to refine archetype, stack, and team ownership. <em>(Click image to zoom full screen)</em>
  </div>
</div>

### 3. Step 3: Synthesize Backstage Catalog & Ingest
Executing ingestion automatically creates Backstage `catalog-info.yaml`, synthesizes executable `dev-setup.sh` environment runners, commits all validated nodes into `.robos/kgraphs/`, registers components in `.robos/packages.yaml`, and updates local workspace discovery in `~/.config/robos/git-projects.json`:

<div style="margin: 2rem 0; border: 1px solid #1e293b; border-radius: 12px; overflow: hidden; background: #0b101b; box-shadow: 0 10px 40px rgba(0,0,0,0.6);">
  <img src="{{ '/assets/images/screenshots/import-app-ingest-complete_frame.png' | relative_url }}" alt="Step 3: Ingestion Complete & Knowledge Graph Mapped" class="robos-zoomable-img" style="display: block; width: 100%; height: auto;" />
  <div style="padding: 0.75rem 1.25rem; font-size: 0.85rem; color: #94a3b8; border-top: 1px solid #1e293b; background: #0d1424; text-align: center;">
    <strong>Step 3: Ingestion Complete</strong>: Real-time synthesis of Backstage catalog metadata, dev-setup scripts, and Knowledge Graph mapping. <em>(Click image to zoom full screen)</em>
  </div>
</div>

---

## What RobOS Generates on Import

1. **Backstage Catalog Component (`catalog-info.yaml`)**:
   If the repository doesn't already contain a Backstage manifest, RobOS generates one with the detected archetype, technology, and team ownership.
2. **Zero-Friction Dev Setup Script (`dev-setup.sh`)**:
   Synthesizes an executable environment verification script checking required runtimes (e.g. Node, Java JDK, Docker) and pulling credentials from the GPG vault.
3. **Registration in Git Projects (`~/.config/robos/git-projects.json`)**:
   Links the local directory into the multi-repo Git Projects manager for one-click branch switching and Monaco editor inspection.
4. **Knowledge Graph Ingestion**:
   Registers the package into `.robos/packages.yaml` and links the service into the live visual architecture map.
5. **Bruno REST API Test Collections (`.bru`)**:
   For microservices with OpenAPI contracts, RobOS automatically generates plain-text `.bru` request collections ready for batch execution in the REST API Client.

---

## E2E Walkthrough Video & Proof of Work

Watch the live end-to-end verification video showing deep inspection, AI prompt refinement, and Backstage synthesis with zero mocking:

<video controls width="100%" style="border-radius: 8px; border: 1px solid #30363d; margin-top: 1rem; margin-bottom: 1.5rem;" poster="{{ '/assets/images/screenshots/import-app-deep-inspection_frame.png' | relative_url }}">
  <source src="{{ '/assets/videos/app-import-wizard-final.webm' | relative_url }}" type="video/webm">
  Your browser does not support the video tag.
</video>

* [👉 **Full Walkthrough Archive & Audio Script**]({{ site.baseurl }}{% link walkthroughs.md %}#step-20-import-existing-apps--codebase-ingestion--archetype-detection)

---

## Next Steps

- **[App Development Flow]({{ site.baseurl }}{% link app-development-flow.md %})**: Follow the step-by-step developer tutorial.
- **[RobOS Main Wins]({{ site.baseurl }}{% link big-wins.md %})**: Discover core architectural innovations and strategic advantages.
- **[💡 Explore the Ideas Store on GitHub](https://github.com/nddipiazza/robos/tree/main/docs/ideas)**: View raw idea dumps, community feature proposals, and structured architecture specs.


