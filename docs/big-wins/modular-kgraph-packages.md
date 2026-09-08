---
title: Modular Namespaced & Multi-Repo KGraph
layout: default
parent: RobOS Big Wins
nav_order: 10
permalink: /big-wins/modular-kgraph-packages.html
---

# Modular Namespaced & Multi-Repo Knowledge Graph Packages
{: .no_toc }

How RobOS partitions enterprise architecture graphs into modular, namespaced package stores indexed by `.robos/kgraph.yaml`—supporting multi-repo composition, Git-tag version pinning, and automated backwards-compatible aggregation.
{: .fs-6 .fw-300 }

## Table of contents
{: .no_toc .text-delta }

1. TOC
{:toc}

---

## The Strategic Advantage: Solving the Monolithic Graph Bottleneck

In large engineering organizations with dozens of teams and hundreds of microservices, storing the entire architecture in a single, monolithic file or centralized database creates severe bottlenecks:
- **Merge Conflicts**: Multiple teams attempting to add services, contracts, or schemas concurrently experience constant Git merge conflicts.
- **Blurred Boundaries**: Monolithic files lack namespace isolation, making it impossible to enforce team ownership, clear access control, or modular package dependencies.
- **No Independent Versioning**: Teams cannot lock external dependencies to immutable release versions, risking unexpected architectural drift.

**The RobOS Big Win:**

> **RobOS decomposes the dual-state SDLC Knowledge Graph into modular, namespaced package stores under `.robos/kgraphs/<pkg>/package.jsonld` indexed by `.robos/kgraph.yaml`—with native support for multi-repo composition and Git-tag version pinning.**

Each architectural domain lives in its own isolated, namespaced package file. Teams author and evolve their services independently, pin dependencies to semantic Git tags (e.g. `v1.2.0`), and rely on automated compilation to maintain unified system-wide visibility.

<div style="margin: 2rem 0; border: 1px solid #1e293b; border-radius: 12px; overflow: hidden; background: #0b101b; box-shadow: 0 10px 40px rgba(0,0,0,0.6);">
  <img src="{{ '/assets/images/screenshots/multi-pkg-modal_frame.png' | relative_url }}" alt="Modular Packages Studio in RobOS" class="robos-zoomable-img" style="display: block; width: 100%; height: auto;" />
  <div style="padding: 0.75rem 1.25rem; font-size: 0.85rem; color: #94a3b8; border-top: 1px solid #1e293b; background: #0d1424; text-align: center;">
    <strong>RobOS Modular Packages Studio</strong>: Managing isolated, namespaced package stores, inspecting package dependencies, and configuring external Git-tag versioned repositories. <em>(Click image to zoom full screen)</em>
  </div>
</div>

---

## The 6 Standard RobOS Namespaced Packages

RobOS organizes the Knowledge Graph into 6 standard packages, each addressing a dedicated architectural lifecycle domain:

```
.robos/
├── kgraph.yaml                      # Master package manifest & registry
└── kgraphs/
    ├── core-platform/
    │   └── package.jsonld          # robos.core: C4 topology, databases, queues
    ├── organization/
    │   └── package.jsonld          # robos.org: Team Topologies, members, GPG keys
    ├── services/
    │   └── package.jsonld          # robos.services: Microservices, OpenAPI, stubs
    ├── applications/
    │   └── package.jsonld          # robos.apps: Frontends, desktop apps, CLIs
    ├── devops/
    │   └── package.jsonld          # robos.devops: Cloud providers, CI/CD, pass credentials
    └── learning/
        └── package.jsonld          # robos.learning: eLearning courses, interactive labs
```

| Package ID | Namespace URI | Description & Scope |
|:---|:---|:---|
| **`core-platform`** | `urn:robos:pkg:core` (`robos.core`) | System architecture, C4 Level 1 & 2 topology, shared databases, Kafka message brokers, and container definitions. |
| **`organization`** | `urn:robos:pkg:org` (`robos.org`) | Team Topologies (Stream-aligned, Platform, Complicated Subsystem, Enabling), human architects, AI personas, and directory sync. |
| **`services`** | `urn:robos:pkg:services` (`robos.services`) | Backend microservices, OpenAPI 3.1 contracts, Protobuf gRPC stubs, BDD feature specifications, and REST endpoints. |
| **`applications`** | `urn:robos:pkg:apps` (`robos.apps`) | Client applications: Frontend SPAs, desktop programs, mobile clients, games, and terminal CLI tools. |
| **`devops`** | `urn:robos:pkg:devops` (`robos.devops`) | Cloud providers (AWS, GCP, Azure), CI/CD pipelines, container registries, OAuth apps, DNS domains, and secure GPG credentials. |
| **`learning`** | `urn:robos:pkg:learning` (`robos.learning`) | Interactive developer eLearning courses, guided labs, audio voiceover scripts, and architectural knowledge modules. |

### Hierarchical Agent Context & Eliminating Duplicate Skills

This modular packaging architecture directly enables **Hierarchical Agent Context & Rules Inheritance**:

- **`core-platform` (`robos.core`)**: Defines Global / Workstation-level defaults, standard development conventions, and base AI agent skills.
- **`organization` (`robos.org`)**: Houses Company and Git Project Organization (`robos:GitProjectOrganization`) policies, open-source governance guidelines, licensing standards, and Team Topologies.
- **`services` (`robos.services`) & `applications` (`robos.apps`)**: Capture repository-specific contracts (OpenAPI, gRPC), TypeSpec schemas, and microservice definitions.

Instead of duplicating the same skill files, `.cursorrules`, or prompt instructions across dozens or hundreds of repositories, rules and skills are authored once at the appropriate package level and dynamically inherited downward during agent execution.

---

## Multi-Repo Composition & Git-Tag Version Pinning

RobOS goes far beyond single-repository monorepos: it natively supports **distributed, multi-repo knowledge graphs**:

```mermaid
graph TD
    subgraph LocalWorkspace [Local Repository: .robos/kgraph.yaml]
        LocalCore[Local Package: core-platform]
        LocalServices[Local Package: services]
    end

    subgraph ExternalRepos [External Git Forges Pinned to Tags]
        SharedContracts[github.com/enterprise/shared-contracts@v2.1.0]
        PlatformInfra[github.com/enterprise/cloud-infra@v1.4.0]
    end

    subgraph LocalCache [Cached Package Store: ~/.robos/cache/kgraphs/]
        Cache1[~/.robos/cache/kgraphs/shared-contracts@v2.1.0/]
        Cache2[~/.robos/cache/kgraphs/cloud-infra@v1.4.0/]
    end

    subgraph UnifiedView [Unified Semantic Graph View]
        Engine[RobOS Graph Engine & Blast Radius Analyzer]
    end

    LocalCore --> Engine
    LocalServices --> Engine
    SharedContracts -->|Git Clone & Cache| Cache1
    PlatformInfra -->|Git Clone & Cache| Cache2
    Cache1 --> Engine
    Cache2 --> Engine
```

### Manifest Configuration (`.robos/kgraph.yaml`)

```yaml
version: "1.0"
workspace: local
packages:
  - id: core-platform
    path: .robos/kgraphs/core-platform/package.jsonld
    namespace: robos.core
  - id: services
    path: .robos/kgraphs/services/package.jsonld
    namespace: robos.services

dependencies:
  - id: enterprise-shared-contracts
    repository: "https://github.com/acme-corp/shared-contracts.git"
    tag: "v2.1.0"
    namespace: acme.contracts
    cachedPath: "~/.robos/cache/kgraphs/shared-contracts@v2.1.0/"
```

- **Semver Immutability**: External dependencies are pinned to semantic Git tags (e.g., `v2.1.0`), guaranteeing reproducible builds and eliminating unexpected contract shifts.
- **On-Demand Caching**: Remote repositories are fetched and cached into `~/.robos/cache/kgraphs/<repo>@<tag>/`, allowing agents and IDEs to query external contracts instantly even when offline.

---

## Backwards-Compatible Aggregation

While each package is stored in its own isolated file, RobOS automatically maintains an aggregated compilation view in memory and as a cached artifact. This ensures existing scripts, Backstage catalog importers, and external tools that expect a single consolidated OSLC/JSON-LD file continue to function without changes.

---

## Next Steps

- **[Explore All RobOS Big Wins]({{ site.baseurl }}{% link big-wins.md %})**: Return to the Big Wins executive overview.
- **[DevOps Security & Password Store]({{ site.baseurl }}{% link big-wins/devops-security-pass.md %})**: Learn about GPG-encrypted credential management.
- **[KGraph-First App Generation]({{ site.baseurl }}{% link big-wins/kgraph-first-app-generation.md %})**: Review how applications are synthesized from package nodes.
- **[Dedicated Knowledge Graph Guide]({{ site.baseurl }}{% link knowledge-graph.md %})**: Read the comprehensive architecture documentation for the RobOS Knowledge Graph.
