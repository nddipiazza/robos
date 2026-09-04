---
title: RobOS — AI-First Software Development Operating System
layout: home
nav_order: 1
nav_exclude: false
---

# RobOS

## The AI-Native Operating System for Software Engineering Teams
{: .fs-9 }

RobOS is a purpose-built developer operating system and desktop ecosystem engineered for **AI Agent Review-Based Software Development**. Autonomous AI agent swarms plan, write code, run deep unit and E2E tests, provision databases, and synthesize Kubernetes infrastructure — while human developers act as Lead Architects, Reviewers, and Approvers.

RobOS can be installed in two ways:
1. **Desktop Suite**: 30+ lightweight, zero-framework Electron developer applications running natively on your existing Linux, macOS, or Windows workstation.
2. **RobOS Ubuntu Distro**: A full-featured Ubuntu 26.04-based developer OS provisioned via QEMU/KVM or flashed directly to bare metal via Rufus/Etcher.

{: .fs-6 .fw-300 }

{: .note }
> **Pre-1.0 Production Architecture.** RobOS is built on open standards: **OASIS OSLC Core 3.0**, **W3C JSON-LD & SHACL**, **Spotify Backstage**, **C4 Architecture Model**, **Microsoft TypeSpec**, **Pact Consumer Contracts**, **Bruno REST Collections**, and **Model Context Protocol (MCP)**.

[⭐ Star on GitHub](https://github.com/nddipiazza/robos){: .btn .btn-primary .fs-5 .mb-4 .mb-md-0 .mr-2 target="_blank" rel="noopener" }
[Get Started]({{ site.baseurl }}{% link getting-started.md %}){: .btn .fs-5 .mb-4 .mb-md-0 .mr-2 }
[System Architecture]({{ site.baseurl }}{% link architecture.md %}){: .btn .fs-5 .mb-4 .mb-md-0 .mr-2 }
[Browse 30+ Apps]({{ site.baseurl }}{% link apps.md %}){: .btn .fs-5 .mb-4 .mb-md-0 }

---

## The Big Wins (What Sets RobOS Apart)

RobOS introduces 4 fundamental architectural breakthroughs that do not exist in traditional IDEs or operating systems:

<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1.5rem; margin: 2rem 0;">

<div style="background: #161b22; border-radius: 8px; padding: 1.5rem; border-top: 4px solid #00bcd4;">
<h3 style="margin-top: 0; color: #00bcd4;"><a href="#win-1-dual-state-sdlc-knowledge-graph" style="color: #00bcd4; text-decoration: none;">🧠 1. Dual-State SDLC Knowledge Graph</a></h3>
<p>Unlike flat code repositories, RobOS maintains a live linked-data knowledge graph (OASIS OSLC / JSON-LD / SHACL) modeling system topology, services, schemas, API contracts, repos, team ownership, and tasks. It tracks <strong>Dual-State Worlds</strong> (<code>main</code> as Live Production vs feature branches as Future State) with semantic blast-radius calculation.</p>
</div>

<div style="background: #161b22; border-radius: 8px; padding: 1.5rem; border-top: 4px solid #8b5cf6;">
<h3 style="margin-top: 0; color: #8b5cf6;"><a href="#win-2-ephemeral-agent-sessions--host-x11-bridging" style="color: #8b5cf6; text-decoration: none;">👤 2. Ephemeral Agent Sessions & Host X11 Bridging</a></h3>
<p>AI agents don't just run CLI subshells; they execute in isolated ephemeral Linux user accounts (<code>/home/agent-...</code>) backed by zero-residue <strong>tmpfs memory mounts</strong>. Agents bridge directly to host X11/Wayland displays to interact with UI applications, inspect rendered DOM snapshots, and test UI components visually.</p>
</div>

<div style="background: #161b22; border-radius: 8px; padding: 1.5rem; border-top: 4px solid #10b981;">
<h3 style="margin-top: 0; color: #10b981;"><a href="#win-3-autonomous-e2e-driven-dev--video-proof" style="color: #10b981; text-decoration: none;">🎥 3. Autonomous E2E Driven Development & Video Proof</a></h3>
<p>Every development task is validated with containerized <strong>Xvfb headless test fabrics</strong>. AI agents prove their implementations by generating high-resolution video walkthroughs, synchronized WebVTT narration subtitles (using local neural Piper TTS), and timestamped DOM assertions before requesting human review.</p>
</div>

<div style="background: #161b22; border-radius: 8px; padding: 1.5rem; border-top: 4px solid #f59e0b;">
<h3 style="margin-top: 0; color: #f59e0b;"><a href="#win-4-100-declarative-gitops-architecture--k8s-synthesis" style="color: #f59e0b; text-decoration: none;">⚡ 4. 100% Declarative GitOps & K8s Synthesis</a></h3>
<p>System topology, data sources, contracts, and work items are stored in standard human-readable <code>.robos/</code> files. When data sources or services are added in System Topology Studio, RobOS automatically synthesizes deployable <strong>Kubernetes manifests and Helm charts</strong> without manual YAML wrangling.</p>
</div>

</div>

---

## Detailed Breakdown of Core Architectural Breakthroughs

### Win 1: Dual-State SDLC Knowledge Graph

Traditional IDEs and AI coding tools only understand flat code files in the active directory. They have no concept of upstream dependencies, downstream microservices, database schemas, or API consumer contracts.

RobOS introduces a unified linked-data knowledge graph based on **OASIS OSLC Core 3.0** and **W3C JSON-LD & SHACL**:

```mermaid
graph TD
    subgraph World1 [World 1: Live Production main]
        P_Topo[Current C4 Topology]
        P_Contract[Active OpenAPI 3.1 & Pact]
        P_Schema[Production TypeSpec Models]
        P_DB[Live Postgres 16 Instance]
    end

    subgraph World2 [World 2: Future Feature Branch]
        F_Topo[Proposed Analytics Warehouse Node]
        F_Contract[New /analytics REST & Events]
        F_Schema[Updated DTO Definitions]
        F_DB[Synthesized K8s Analytics DB]
    end

    Diff{Semantic Graph Diff & SHACL Engine}
    World1 --> Diff
    World2 --> Diff
    Diff --> Radius[Blast Radius & Breaking Change Report]
```

#### How the Dual-State Engine Works:
1. **World 1 (Live Production `main`)**: Models the active running state of your software — deployed services, registered API contracts, active entity schemas, and live database topologies.
2. **World 2 (Future Feature Branch)**: Models the projected state of the world when the current task, pull request, or architectural spike is merged.
3. **Semantic Graph Diffing**: When an agent proposes a change, RobOS evaluates the graph delta. If a backend contract changes a required field, the engine flags affected frontend consumers and database migrations **before any code is written**.
4. **Standardized Git Storage**: The entire graph is stored in `.robos/knowledge-graph.jsonld` with zero proprietary database dependencies.

---

### Win 2: Ephemeral Agent Sessions & Host X11 Bridging

Traditional AI coding agents run in the developer's root user account or subshell, risking credential leaks, port collisions, and filesystem pollution.

RobOS creates **ephemeral, isolated Linux agent profiles** with direct X11/Wayland host display forwarding:

```mermaid
sequenceDiagram
    participant Host as RobOS Desktop Host (Port 2224 / Display :0)
    participant Daemon as robos-profiled & robos-agentd
    participant Agent as Ephemeral Agent User (/home/agent-task-108)
    participant App as Electron App (e.g. Relational DB Manager)

    Host->>Daemon: Dispatch Task "Add Postgres DB"
    Daemon->>Agent: Create ephemeral Linux user + mount tmpfs on /home/agent-task-108
    Daemon->>Agent: Bridge DISPLAY=:0 (or headless :99) + inject MCP socket
    Agent->>App: Launch DB Manager & execute SQL test query
    App-->>Agent: Render DOM hierarchy & live data grid
    Agent->>Daemon: Capture DOM snapshot (port 19100) & Video frame
    Daemon->>Agent: Tear down user & unmount tmpfs (Zero Residue)
```

#### Key Technical Advantages:
- **Zero-Residue `tmpfs` RAM Mounts**: Agent home directories (`/home/agent-...`) exist purely in RAM memory. When the agent session terminates, the account is deleted and unmounted, leaving zero orphaned files.
- **Direct X11/Wayland Display Forwarding**: Agents are not blind CLI bots; they can launch real graphical Electron applications, render UI components, and interact with live desktop windows.
- **DOM Snapshot Debug Bridge**: Agents inspect live DOM trees via `packages/robos-lib/snapshot-cli.js` across dedicated IPC debug ports (`19100–19182`), ensuring pixel-accurate and DOM-verified visual tests.

---

### Win 3: Autonomous E2E Driven Development & Video Proof

LLMs can easily produce plausible-looking code that fails at runtime. RobOS enforces a strict standard: **no code change is presented for human review without automated end-to-end verification and video proof-of-work**.

```mermaid
flowchart LR
    A["Task Intake"] --> B["Headless Xvfb Compositor (1080p)"]
    B --> C["DOM State & Contract Assertions"]
    C --> D["Neural Piper TTS Voiceover"]
    D --> E["1080p WebM + WebVTT Walkthrough Archive"]
    E --> F["1-Click Human Approval"]
```

#### How the Automated Verification Fabric Works:
1. **Headless Virtual Compositor (`Xvfb + Picom`)**: The entire test suite executes in a headless 1920x1080 virtual framebuffer with full hardware compositing emulation.
2. **Deterministic DOM Assertions**: Tests wait for DOM elements, verify table grids, test live SQL queries, and validate HTTP 200/201 response status codes.
3. **Synchronized Video & Subtitles**: Generates complete 1080p WebM video recordings with subtitle tracks synthesized via local, offline **Piper neural text-to-speech (TTS)**.
4. **Walkthrough Archive**: All demo recordings and transcripts are permanently archived to `~/.robos/development/walkthroughs/<slug>/` with timestamped historical logs.

---

### Win 4: 100% Declarative GitOps Architecture & K8s Synthesis

Many development platforms lock you into cloud databases or complex configuration systems. RobOS stores everything in standard, human-readable Git files under `.robos/`.

```mermaid
flowchart TD
    UI["System Topology Studio (UI)"] -->|Add Node| KGraph[".robos/knowledge-graph.jsonld"]
    KGraph -->|Auto-Synthesize| K8s["manifests/petshop-baseline/04-analytics-postgres.yaml"]
    KGraph -->|Auto-Synthesize| Helm["helm/charts/templates/analytics-db.yaml"]
    K8s -->|Deploy| Cluster["Kind / EKS / GKE / AKS Cluster"]
    Cluster -->|Connect| DBM["RobOS Relational DB Manager"]
    DBM -->|Verify| REST["RobOS Bruno REST Client (.bru)"]
```

#### Automated Kubernetes & Cloud Lifecycle:
- **Instant Infrastructure Synthesis**: Adding a PostgreSQL, MySQL, Redis, or Kafka node in System Topology Studio automatically synthesizes deployable Kubernetes manifests and Helm chart templates.
- **Multi-Cluster Support**: Kube Studio natively connects to local Kind clusters or remote enterprise clouds (EKS, GKE, AKS) with live pod log streaming and ArgoCD GitOps sync.
- **Git-Backed Bruno REST Collections**: Microservices and APIs are automatically converted into `.bru` collection files for automated test execution without cloud vendor lock-in.

---

## AI Agent Review-Based Development

Traditional software development puts the burden of investigation, debugging, and initial coding on the human developer. **RobOS inverts this workflow**:

```mermaid
graph LR
    subgraph AutonomousAI [Autonomous AI Agent Swarm]
        T[Task Pickup] --> R[Repo & Contract Investigation]
        R --> B[Breakpoint Reproduction & Fix]
        B --> K[K8s & DB Synthesis]
        K --> V[Xvfb E2E Test & Video Proof]
    end

    subgraph HumanEngineer [Human Lead Architect]
        V --> P[Interactive Review & Plan Approval]
        P --> M[1-Click Merge & Prod Release]
    end
```

1. **AI Investigates & Reproduces**: When a task is picked up, the AI provisions an isolated workspace, reproduces the problem at a live breakpoint, and drafts a concrete architectural plan.
2. **Interactive Plan Review (`/grill-me`)**: The lead architect reviews the plan, grills the AI on edge cases, and adjusts requirements before any code is written.
3. **Autonomous Implementation & Verification**: The AI implements code, runs unit tests, updates API contracts, provisions databases, and runs headless E2E verifications.
4. **Human Final Approval**: The human reviews the PR, visual diffs, and narrated video walkthrough, then approves with 1 click.

---

## Visual Tour of the RobOS Suite

### System Topology & Knowledge Graph Studio
Visually map and manage your entire engineering architecture without writing tedious infrastructure boilerplate:
- **C4 Architecture Modeling (Levels 1–3)**: Zoom from high-level user personas and third-party SaaS systems (**Level 1: System Context**), into polyglot microservices, frontends, and databases (**Level 2: Containers**), down to internal controllers and domain modules (**Level 3: Components**).
- **Spotify Backstage Integration**: Automatically imports and synchronizes your team's `catalog-info.yaml` software catalogs so services, API contracts, and team ownership are always live and linked.
- **On-the-Fly Kubernetes & Helm Synthesis**: Whenever you add a new database (e.g. PostgreSQL, Redis, Kafka) or microservice to the canvas, RobOS automatically generates the ready-to-deploy Kubernetes StatefulSet/Deployment YAML manifests and Helm chart templates.
![RobOS System Topology]({{ '/assets/images/screenshots/topology-db-c4_polyglot_frame.png' | relative_url }})

### RobOS Relational DB Manager (PostgreSQL, Oracle, MySQL)
Inspect live schemas, view data grids, run multi-tab SQL console queries with sub-millisecond latency, and generate DDL:
![RobOS Relational DB Manager]({{ '/assets/images/screenshots/dev-tools-table_data_grid_frame.png' | relative_url }})

### RobOS Data Sources & Knowledge Graph Explorer
Manage SQL, NoSQL, Object Storage (S3), and Kafka streaming data sources with live connection testing:
![RobOS Data Sources]({{ '/assets/images/screenshots/data-sources-postgres_overview_frame.png' | relative_url }})

### RobOS REST API Client (Bruno-Powered)
Git-backed REST collections, collection runners, environment matrices, and automated test assertions:
![RobOS REST API Client]({{ '/assets/images/screenshots/acme-petshop-step11-collections_tree_frame.png' | relative_url }})

### Kube Studio & Cloud Infrastructure Navigator
Multi-cluster Kubernetes, ArgoCD GitOps, Helm release tracking, and automated container lifecycle management:
![Kube Studio]({{ '/assets/images/screenshots/topology-db-datasource_synthesized_frame.png' | relative_url }})

---

## Installation Options

### ⭐️ Primary Option: Install on Current Ubuntu GNOME Desktop
Install the full suite of 30+ RobOS desktop apps, GNOME launchers, and shared libraries directly onto your existing Ubuntu machine (22.04, 24.04, or 26.04):
```bash
# Clone the repository
git clone https://github.com/nddipiazza/robos.git
cd robos

# Audit & install dependencies
node scripts/install-dev-deps.js

# Install all apps and desktop integration to /usr/local/share/robos/
sudo bash packages/desktop-shell/install.sh
```

### Option 2: Install Full RobOS Ubuntu OS Distro (Bare Metal & VM)
Build a dedicated, bare-metal bootable ISO (flashable via Rufus / Etcher) or run in a local QEMU/KVM virtual machine:
```bash
# Build disk image + cloud-init ISO
infra/desktop/build.sh

# Run virtual machine (16GB RAM, all host CPUs, SSH port 2224)
infra/desktop/run.sh
```

### Option 3: Cross-Platform Desktop App Suite (Windows & macOS Coming Soon)
- **Linux (Available Now)**: Run all 30+ Electron developer apps directly with Node.js 20+.
- **macOS / OS X (Coming Soon)**: Universal `.dmg` installer and Homebrew Cask with native Apple Silicon (M1–M4) support and top menu bar widget.
- **Windows (Coming Soon)**: One-click MSI package with WSL2 integration for ephemeral agent profile isolation.

---

## Open-Source Standards Integrated ("Reinvent Nothing!")

RobOS is built entirely upon established, battle-tested open standards. Instead of inventing proprietary formats, RobOS connects leading open-source specifications into a cohesive operating system:

| Standard / Technology | Industry Purpose | What RobOS Uses It For |
|:---|:---|:---|
| **[OASIS OSLC Core 3.0](https://open-services.net/) & [W3C JSON-LD](https://www.w3.org/TR/json-ld11/)** | Global ISO/OASIS linked-data standard for software lifecycle tool integration. | **Dual-State SDLC Knowledge Graph (`.robos/knowledge-graph.jsonld`)**: Links microservices, schemas, contracts, Git repositories, and tasks into a unified linked-data graph. Powers semantic graph diffs between Live Production (`main`) and Future feature states with SHACL constraint validation. |
| **[Spotify Backstage](https://backstage.io/) (`catalog-info.yaml`)** | Industry-standard developer portal catalog format for service and API ownership. | **Zero-Config System Topology Discovery**: RobOS parses your existing Backstage `catalog-info.yaml` files across Git repositories to automatically populate the System Topology canvas without manual data entry. |
| **[C4 Architecture Model](https://c4model.com/) & Structurizr** | Hierarchical architecture visualization framework across 4 zooming levels. | **Visual Topology Studio & Blast Radius Inspector**: Renders polyglot microservice architectures across Level 1 (System Context), Level 2 (Containers & DBs), and Level 3 (Components), and exports C4 Structurizr PlantUML diagrams. |
| **[Microsoft TypeSpec](https://typespec.io/) & [Buf / Protobuf](https://buf.build/)** | Single-source-of-truth schema definition languages for domain models and DTOs. | **Entity Schema Studio (`schema-studio`)**: Developers and AI agents define entity schemas in TypeSpec once; RobOS compiles them into multi-language TypeScript, Java Records, and Go struct packages automatically. |
| **[OpenAPI 3.1](https://www.openapis.org/) & [AsyncAPI](https://www.asyncapi.com/)** | Global standards for documenting synchronous RESTful APIs and asynchronous event streams. | **Contract Studio & Mock Servers (`contract-studio`)**: Authors and validates API contracts with live Spectral linting, powers Prism mock servers, and auto-detects breaking API changes before code generation. |
| **[Pact](https://pact.io/) Consumer Contracts** | Consumer-driven contract testing framework guaranteeing microservice compatibility. | **Automated PR Merge Verification Gates**: Validates that changes made by AI agents or developers do not break downstream consumers or frontends before pull requests can be merged. |
| **[UseBruno](https://www.usebruno.com/) (`.bru`)** | Git-backed, open-source REST client storing plain-text `.bru` files in repositories. | **RobOS REST API Client & Collection Runner**: Automatically synthesizes `.bru` collections from OpenAPI specs, executes automated test suites, and records latency scorecards with zero cloud lock-in. |
| **[Devcontainers](https://containers.dev/) & [Docker / Kind](https://kind.sigs.k8s.io/)** | Standardized container specifications for isolated developer environments. | **Hermetic Workspace Provisioning & Local Test Fabrics**: Automatically provisions task workspaces and spins up local Kind Kubernetes clusters with pre-seeded databases and mock dependencies. |
| **[Model Context Protocol (MCP)](https://modelcontextprotocol.io/)** | Anthropic's universal JSON-RPC protocol connecting AI models to external tools. | **Unified Multi-Agent Tool Router (`robos-mcp-router`)**: Exposes system capabilities (Knowledge Graph, IDE Breakpoints, Kubernetes Deployments, Database Console) to Claude Code, Google Antigravity, Copilot CLI, and Gemini with OAuth popups. |
| **[Piper Neural TTS](https://github.com/rhasspy/piper)** | Ultra-fast, lightweight, offline neural text-to-speech synthesis engine. | **Automated Video Proof-of-Work Voiceovers**: Generates natural, synchronized neural voiceovers and WebVTT subtitle tracks for all 1080p demo walkthrough videos generated during headless E2E testing. |
| **DBeaver & DataGrip SQL Paradigms** | Professional multi-database management interfaces with schema explorers and data grids. | **RobOS Relational DB Manager (`db-manager`)**: Multi-tab SQL query consoles, table data grids, sub-millisecond execution metrics, and DDL generators for PostgreSQL, MySQL, and Oracle. |
