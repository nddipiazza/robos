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

RobOS introduces key technological capabilities that do not exist in traditional IDEs or operating systems today:

<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1.5rem; margin: 2rem 0;">

<div style="background: #161b22; border-radius: 8px; padding: 1.5rem; border-top: 4px solid #00bcd4;">
<h3 style="margin-top: 0; color: #00bcd4;">🧠 1. Dual-State SDLC Knowledge Graph</h3>
<p>Unlike flat code repositories, RobOS maintains a live linked-data knowledge graph (OASIS OSLC / JSON-LD / SHACL) modeling system topology, services, schemas, API contracts, repos, team ownership, and tasks. It tracks <strong>Dual-State Worlds</strong> (<code>main</code> as Live Production vs feature branches as Future State) with semantic blast-radius calculation.</p>
</div>

<div style="background: #161b22; border-radius: 8px; padding: 1.5rem; border-top: 4px solid #8b5cf6;">
<h3 style="margin-top: 0; color: #8b5cf6;">👤 2. Ephemeral Agent Sessions & Host X11 Bridging</h3>
<p>AI agents don't just run CLI subshells; they execute in isolated ephemeral Linux user accounts (<code>/home/agent-...</code>) backed by zero-residue <strong>tmpfs memory mounts</strong>. Agents bridge directly to host X11/Wayland displays to interact with UI applications, inspect rendered DOM snapshots, and test UI components visually.</p>
</div>

<div style="background: #161b22; border-radius: 8px; padding: 1.5rem; border-top: 4px solid #10b981;">
<h3 style="margin-top: 0; color: #10b981;">🎥 3. Autonomous E2E Driven Development & Video Proof</h3>
<p>Every development task is validated with containerized <strong>Xvfb headless test fabrics</strong>. AI agents prove their implementations by generating high-resolution video walkthroughs, synchronized WebVTT narration subtitles (using local neural Piper TTS), and timestamped DOM assertions before requesting human review.</p>
</div>

<div style="background: #161b22; border-radius: 8px; padding: 1.5rem; border-top: 4px solid #f59e0b;">
<h3 style="margin-top: 0; color: #f59e0b;">⚡ 4. 100% Declarative GitOps Architecture</h3>
<p>System topology, data sources, contracts, and work items are stored in standard human-readable <code>.robos/</code> files. When data sources or services are added in System Topology Studio, RobOS automatically synthesizes deployable <strong>Kubernetes manifests and Helm charts</strong> without manual YAML wrangling.</p>
</div>

</div>

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
Define C4 level 1-3 architecture, Backstage software catalogs, and synthesize Kubernetes Helm templates on the fly:
![RobOS System Topology]({{ '/assets/images/screenshots/topology-db-c4_polyglot_frame.png' | relative_url }})

### RobOS Relational DB Manager (PostgreSQL, Oracle, MySQL)
Inspect live schemas, view data grids, run multi-tab SQL console queries with sub-millisecond latency, and generate DDL:
![RobOS Relational DB Manager]({{ '/assets/images/screenshots/dev-tools-table_data_grid_frame.png' | relative_url }})

### RobOS Data Sources & Knowledge Graph Explorer
Manage SQL, NoSQL, Object Storage (S3), and Kafka streaming data sources with live connection testing:
![RobOS Data Sources]({{ '/assets/images/screenshots/data-sources-postgres_overview_frame.png' | relative_url }})

### RobOS REST API Client (Bruno-Powered)
Git-backed REST collections, collection runners, environment matrices, and automated test assertions:
![RobOS REST API Client]({{ '/assets/images/screenshots/data-sources-test_connection_frame.png' | relative_url }})

### Kube Studio & Cloud Infrastructure Navigator
Multi-cluster Kubernetes, ArgoCD GitOps, Helm release tracking, and automated container lifecycle management:
![Kube Studio]({{ '/assets/images/screenshots/topology-db-datasource_synthesized_frame.png' | relative_url }})

---

## Installation Options

### Option 1: Install as Desktop App Suite
Run the full suite of 30+ RobOS Electron applications on your existing operating system:
```bash
# Clone the repository
git clone https://github.com/nddipiazza/robos.git
cd robos

# Install dependencies
npm run setup

# Launch any application or developer harness
node packages/robos-test/lib/harness.js --app db-manager
```

### Option 2: Install Full RobOS Ubuntu OS Distro
Build a bootable QEMU/KVM disk image or write a flashable USB drive for bare-metal deployment:
```bash
# Build disk image + cloud-init ISO
infra/desktop/build.sh

# Run virtual machine (16GB RAM, all host CPUs, SSH port 2224)
infra/desktop/run.sh
```

---

## Open-Source Standards Integrated

| Capability | Standard / Technology | How RobOS Integrates It |
|---|---|---|
| **Knowledge Graph** | [OASIS OSLC Core 3.0](https://open-services.net/), [W3C JSON-LD](https://www.w3.org/TR/json-ld11/) | Full system world state stored in `.robos/knowledge-graph.jsonld`. |
| **Architecture Topology** | [Backstage](https://backstage.io/), [C4 Model](https://c4model.com/) | Reads Backstage `catalog-info.yaml` and exports C4 Structurizr PlantUML. |
| **API Contracts** | [OpenAPI 3.1](https://www.openapis.org/), [Pact](https://pact.io/), [AsyncAPI](https://www.asyncapi.com/) | Contract-driven testing and consumer verification gates. |
| **Entity Schemas** | [Microsoft TypeSpec](https://typespec.io/), [Buf](https://buf.build/) | Single source of truth compiling to TypeScript, Java, and Go DTOs. |
| **REST Collections** | [UseBruno](https://www.usebruno.com/) | Git-backed `.bru` collections with zero cloud lock-in. |
| **Local Environments** | [Devcontainers](https://containers.dev/), [Docker](https://www.docker.com/) | Standardized `.devcontainer.json` workspace isolation. |
| **Agent Protocols** | [Model Context Protocol (MCP)](https://modelcontextprotocol.io/) | Claude Code, Antigravity, Copilot CLI, and Gemini tooling integrations. |
| **Neural TTS** | [Piper TTS](https://github.com/rhasspy/piper) | Offline neural text-to-speech for synchronized demo video voiceovers. |
