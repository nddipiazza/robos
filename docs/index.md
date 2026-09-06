---
title: RobOS — Knowledge Graph-First Developer OS & Application Suite
layout: home
nav_order: 1
nav_exclude: false
---

# RobOS

## Knowledge Graph-First Application Generation: Build the KGraph, Auto-Generate the Apps
{: .fs-9 }

The way software is built has fundamentally changed. Just as an OpenAPI contract automatically generates a typed REST web service client, a RobOS Knowledge Graph adhering to our schema enables full applications to become, for all intents and purposes, **auto-generated**.

Autonomous AI agent swarms can now investigate complex bugs, scaffold multi-service architectures, write code across polyglot repositories, and spin up local infrastructure. Yet traditional developer environments are still stuck in the past—engineers are drowning in disconnected browser tabs, fragmented CLI tools, mystery YAML, and AI assistants that dump untested code onto local machines, leaving humans to spend hours untangling broken dependencies and invisible blast radiuses.

**RobOS was created to solve this.**

RobOS is the developer operating system and native 30+ desktop application suite engineered for **Knowledge Graph-First (KGraph-First) Application Generation and Agent Review-Based Software Development**. Human engineers act as **Lead System Architects** designing and evolving the Knowledge Graph, while autonomous agent swarms synthesize source code, databases, and infrastructure in isolated, clutter-free environments.

{: .fs-6 .fw-300 }

<div style="margin: 2rem 0; border: 1px solid #1e293b; border-radius: 12px; overflow: hidden; background: #0b101b; box-shadow: 0 10px 40px rgba(0,0,0,0.6);">
  <img src="{{ '/assets/images/kgraph-autogen-architecture.jpg' | relative_url }}" alt="Knowledge Graph-First Application Generation and Agent Review-Based Software Development Workflow" class="robos-zoomable-img" style="display: block; width: 100%; height: auto;" />
  <div style="padding: 0.75rem 1.25rem; font-size: 0.85rem; color: #94a3b8; border-top: 1px solid #1e293b; background: #0d1424; text-align: center;">
    <strong>The 4-Stage Lifecycle</strong>: 1) Human Lead Architect & KGraph Blueprint ──▶ 2) RobOS Synthesis Engine & Autonomous Swarms ──▶ 3) Ephemeral In-Memory Sandbox Verification ──▶ 4) Agent Review & Human Approval. <em>(Click image to zoom full screen)</em>
  </div>
</div>

{: .note }
> **Built on Battle-Tested Open Standards.** RobOS invents no proprietary locks or closed SaaS silos. Everything is backed by plain-text files in your Git repository under `.robos/` and built on open industry standards: **OASIS OSLC 3.0**, **W3C JSON-LD**, **Spotify Backstage**, **C4 Architecture Model**, **Microsoft TypeSpec**, **Pact Consumer Contracts**, **Kubernetes & Helm**, and **Model Context Protocol (MCP)**.

[⭐ Star on GitHub](https://github.com/nddipiazza/robos){: .btn .btn-primary .fs-5 .mb-4 .mb-md-0 .mr-2 target="_blank" rel="noopener" }
[Get Started]({{ site.baseurl }}{% link getting-started.md %}){: .btn .fs-5 .mb-4 .mb-md-0 .mr-2 }
[The 4 Pillars]({{ site.baseurl }}{% link four-pillars.md %}){: .btn .fs-5 .mb-4 .mb-md-0 .mr-2 }
[Day in the Life]({{ site.baseurl }}{% link day-in-the-life.md %}){: .btn .fs-5 .mb-4 .mb-md-0 .mr-2 }
[System Architecture]({{ site.baseurl }}{% link architecture.md %}){: .btn .fs-5 .mb-4 .mb-md-0 .mr-2 }
[Browse 30+ Apps]({{ site.baseurl }}{% link apps.md %}){: .btn .fs-5 .mb-4 .mb-md-0 .mr-2 }
[Real-World Walkthroughs]({{ site.baseurl }}{% link walkthroughs.md %}){: .btn .fs-5 .mb-4 .mb-md-0 }

<div style="margin: 1.5rem 0 0.5rem; display: flex; flex-wrap: wrap; gap: 0.5rem;">
  <a href="{{ site.baseurl }}{% link new-company-setup.md %}" class="btn fs-3">🚀 New Company Setup</a>
  <a href="{{ site.baseurl }}{% link existing-company-setup.md %}" class="btn fs-3">🏢 Existing Company Setup</a>
  <a href="{{ site.baseurl }}{% link new-app-wizard.md %}" class="btn fs-3">✨ Develop a New App</a>
  <a href="{{ site.baseurl }}{% link app-import-wizard.md %}" class="btn fs-3">📥 Import Existing Apps</a>
</div>

---

## The Story: Why We Built RobOS

### The 3 Growing Pains of Modern AI Development

Today's AI coding tools are designed as simple add-ons: an autocomplete extension in your editor or a chat sidebar in a browser. While they generate code quickly, they introduce three severe bottlenecks:

1. **Context Blindness & Invisible Blast Radiuses**  
   An AI assistant looking at a single file or directory has no awareness of the surrounding system. It doesn't know that renaming a database column breaks a downstream analytics pipeline, or that modifying an API response payload violates a frontend contract. The developer is left to manually trace the ripple effects across dozens of repositories.

2. **Workstation Clutter & The Machine Pollution Problem**  
   When autonomous agents run shell commands directly in your home directory, they leave behind orphaned node modules, temporary build artifacts, stray Docker containers, and conflicting background processes. Worse, they risk exposing personal credentials or overwriting uncommitted work.

3. **Hallucinations & Review Fatigue ("Trust Me, It Works")**  
   Current agents claim "Task complete!" without proving anything. They don't verify if buttons click, if schemas migrate cleanly, or if containers start. Reviewing raw walls of AI-generated diffs without language servers, symbol lookup, or execution context forces developers into exhausting manual verification loops.

<div style="margin: 2rem 0; border: 1px solid #1e293b; border-radius: 12px; overflow: hidden; background: #0b101b; box-shadow: 0 10px 40px rgba(0,0,0,0.6);">
  <img src="{{ '/assets/images/typing-bottleneck.jpg' | relative_url }}" alt="The Typing Bottleneck in Traditional Software Development" class="robos-zoomable-img" style="display: block; width: 100%; height: auto;" />
  <div style="padding: 0.75rem 1.25rem; font-size: 0.85rem; color: #94a3b8; border-top: 1px solid #1e293b; background: #0d1424; text-align: center;">
    <strong>The Typing Bottleneck</strong>: Huge streams of user stories, feature requests, and architecture requirements funneling down into a lone developer manually typing code character-by-character amid repetitive boilerplate and syntax errors.
  </div>
</div>

### The Solution: KGraph-First Application Generation & Agent Review

RobOS turns the developer into a **Lead Architect**. Just as OpenAPI specifications automatically generate REST client SDKs, your RobOS Knowledge Graph enables full applications to become **auto-generated**. You don't spend your day writing repetitive boilerplate or setting up test databases. Instead:

- **KGraph as the Executable Master Blueprint**: You model your system in the Knowledge Graph. RobOS compiles and synthesizes the codebase, data entities, controllers, and Kubernetes manifests automatically.
- **AI Agents Grounded in the Knowledge Graph**: Agents inspect the full architecture map, identify dependencies across microservices and schemas, reproduce bugs, and draft structured technical proposals.
- **Continuous Human-in-the-Loop Alignment**: Rather than making assumptions in a black box, RobOS workflows actively pick and probe at the human architect—clarifying ambiguities, challenging design trade-offs, and ensuring the lead engineer is intimately in the know before any code is generated.
- **Agents Execute in Ephemeral Sandboxes**: Code is written and tested in temporary memory environments that leave zero residue on your workstation.
- **AI Proves Its Work**: Agents execute real end-to-end tests on an isolated virtual screen, capturing high-definition video walkthroughs and neural voiceovers proving every assertion.
- **You Review With Full IDE Context**: Review pull requests in the dedicated RobOS PR Platform or jump straight into **IntelliJ IDEA** or **VS Code** with full AST navigation, symbol lookup, and local debugging tools.

---

## The 4 Architectural Pillars of RobOS

RobOS is built around 4 core innovations that separate a true AI-first operating system from traditional coding environments:

<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1.5rem; margin: 2rem 0;">

<div style="background: #161b22; border-radius: 8px; padding: 1.5rem; border-top: 4px solid #00bcd4;">
<h3 style="margin-top: 0; color: #00bcd4;">🧠 1. Dual-State Living Architecture & KGraph Generation</h3>
<p>RobOS maintains a linked knowledge graph comparing <strong>World 1 (Live Production)</strong> against <strong>World 2 (Your Feature Branch)</strong>. It serves as both the master blueprint from which applications are auto-generated and the semantic engine calculating the exact blast radius of every change across microservices, schemas, and contracts <em>before</em> any code is merged.</p>
</div>

<div style="background: #161b22; border-radius: 8px; padding: 1.5rem; border-top: 4px solid #8b5cf6;">
<h3 style="margin-top: 0; color: #8b5cf6;">👤 2. Ephemeral In-Memory Agent Sandboxes</h3>
<p>AI agents run in isolated Linux profiles mounted in high-speed RAM (<code>tmpfs</code>) on private virtual X11 displays. When the task finishes, the memory is wiped clean with zero leftover temporary files, stray ports, or rogue background processes.</p>
</div>

<div style="background: #161b22; border-radius: 8px; padding: 1.5rem; border-top: 4px solid #10b981;">
<h3 style="margin-top: 0; color: #10b981;">🎥 3. Automated Video Proof-of-Work</h3>
<p>No code change reaches human review without automated visual proof. Agents run end-to-end verifications, click real buttons, query real databases, and record 1080p narrated videos so you can review complex features in under 30 seconds.</p>
</div>

<div style="background: #161b22; border-radius: 8px; padding: 1.5rem; border-top: 4px solid #f59e0b;">
<h3 style="margin-top: 0; color: #f59e0b;">⚡ 4. Zero-YAML Declarative GitOps</h3>
<p>System topology, data sources, and contracts are saved in clean, human-readable Git files under <code>.robos/</code>. Adding a database or service to your visual architecture automatically synthesizes ready-to-deploy <strong>Kubernetes manifests and Helm charts</strong>.</p>
</div>

</div>

<div style="text-align: center; margin: 1.5rem 0 2.5rem;">
  <a href="{{ site.baseurl }}{% link four-pillars.md %}" class="btn btn-primary fs-5">Explore the 4 Architectural Pillars in Depth →</a>
</div>

---

## A Day in the Life: From Business Idea to Production

RobOS coordinates its 30+ native applications into an orchestrated lifecycle—taking a raw business requirement through automated planning, visual architecture, contract design, ephemeral agent implementation, multi-protocol verification, and IDE review, all the way to live cloud operations.

<div style="margin: 2rem 0; border: 1px solid #1e293b; border-radius: 12px; overflow: hidden; background: #0b101b; box-shadow: 0 10px 40px rgba(0,0,0,0.6);">
  <img src="{{ '/assets/images/day-in-the-life-flowchart.jpg' | relative_url }}" alt="RobOS Lifecycle: From Business Idea to Production Flowchart" class="robos-zoomable-img" style="display: block; width: 100%; height: auto;" />
  <div style="padding: 0.75rem 1.25rem; font-size: 0.85rem; color: #94a3b8; border-top: 1px solid #1e293b; background: #0d1424; text-align: center;">
    <strong>The Complete Application Lifecycle Flowchart</strong>: How native RobOS apps connect from planning through production. <em>(Click image to zoom full screen)</em>
  </div>
</div>

<div style="text-align: center; margin: 1.5rem 0 2.5rem;">
  <a href="{{ site.baseurl }}{% link day-in-the-life.md %}" class="btn btn-primary fs-5">Explore A Day in the Life in Depth →</a>
</div>

---

## The Complete Native Application Suite

RobOS provides over 30 native developer applications designed with zero web-framework bloat (Electron + vanilla JavaScript), sharing a unified dark theme and local system services:

### 🏗️ Architecture & Scaffolding
- **App Wizard**: Greenfield scaffolding and brownfield codebase ingestion across 6 application archetypes (`Microservice`, `DesktopApp`, `ConsoleApp`, `MobileApp`, `DataPipeline`, and `Library`).
- **System Topology Studio**: Interactive visual canvas for C4 architecture modeling, dependency mapping, and automatic Kubernetes/Helm manifest generation.
- **Group Manager**: Enterprise directory synchronization (Okta, Azure AD SCIM, Google Workspace, OpenLDAP) and declarative Team Topologies management (`.robos/teams.yaml`).
- **Dev Central**: Your daily developer dashboard with sprint tracking, PR health, calendar, AI standup notes, and blocker radar.

### 🗄️ Databases & Multi-Protocol Testing
- **Relational DB Manager**: Professional multi-database manager (PostgreSQL, MySQL, Oracle) with schema browsing, interactive data grids, and SQL consoles.
- **NoSQL DB Manager**: Document and key-value store manager for MongoDB and Redis with live TTL inspection.
- **REST API Client**: Git-backed API client storing plain-text `.bru` request files directly in your repository with automated contract synthesis.
- **gRPC Client**: Protobuf microservice testing client with server reflection and stream inspection.
- **GraphQL Client**: Interactive schema explorer, query editor, and variable runner.
- **Data Sources Explorer**: Centralized hub connecting relational databases, object stores (AWS S3), and Kafka streaming topics.

### 🔍 Code Review, Quality & Cloud Ops
- **Agent Code Review Platform**: Autonomous AI pull request auditor, semantic diff viewer, and IDE review bridge (IntelliJ IDEA & VS Code plugins).
- **Kube Studio**: Multi-cluster Kubernetes navigator, Helm release manager, and live container log streaming console.
- **CI Monitor**: Real-time pipeline monitoring with automated AI root-cause analysis for broken builds.
- **Deploy Tracker**: Multi-environment deployment tracking across Development, Staging, and Production with DORA metrics.

### 🤖 AI Orchestration & Developer Tools
- **Agents Manager & MCP Router**: Manage local AI agents (Claude Code, Google Antigravity, GitHub Copilot, Google Gemini) via standardized Model Context Protocol tools.
- **Knowledge Graph Explorer**: Dual-state linked data browser with SHACL validation and living documentation sync.
- **Contract Studio**: OpenAPI 3.1 and AsyncAPI contract designer with instant mock servers.
- **Pass Manager**: Encrypted local password and secret vault backed by GPG.

---

## Built on Battle-Tested Open Standards ("Reinvent Nothing!")

RobOS is built entirely on open, industry-standard specifications. Instead of inventing proprietary formats, RobOS connects proven technologies into a unified developer operating system:

| Standard / Technology | Industry Purpose | How RobOS Uses It |
|:---|:---|:---|
| **[OASIS OSLC Core 3.0](https://open-services.net/) & [W3C JSON-LD](https://www.w3.org/TR/json-ld11/)** | Global standard for linking software lifecycle data across disparate tools. | **Dual-State Knowledge Graph (`.robos/knowledge-graph.jsonld`)**: Links microservices, schemas, contracts, repositories, tasks, and training courses into a unified graph. Powers blast radius analysis and documentation synchronization. |
| **[Spotify Backstage](https://backstage.io/) (`catalog-info.yaml`)** | Industry-standard developer portal catalog for service and team ownership. | **Zero-Config Architecture Discovery**: Reads existing `catalog-info.yaml` files across Git repositories to automatically populate the visual topology canvas. |
| **[C4 Architecture Model](https://c4model.com/) & Structurizr** | Hierarchical architecture visualization framework across 4 zoom levels. | **Visual Topology Studio**: Renders software systems across Level 1 (Context), Level 2 (Containers & DBs), and Level 3 (Components) with exportable Structurizr diagrams. |
| **[Microsoft TypeSpec](https://typespec.io/) & [Buf / Protobuf](https://buf.build/)** | Single-source schema definition languages for domain models and DTOs. | **Schema Studio**: Define data models once in TypeSpec; RobOS automatically compiles matching TypeScript types, Java Records, and Go structs. |
| **[OpenAPI 3.1](https://www.openapis.org/) & [AsyncAPI](https://www.asyncapi.com/)** | Global specifications for RESTful APIs and asynchronous message streams. | **Contract Studio & Mock Servers**: Validates contracts with Spectral linting, powers local mock servers, and detects breaking changes upfront. |
| **[Pact](https://pact.io/) Consumer Contracts** | Consumer-driven contract testing framework guaranteeing service compatibility. | **Automated Merge Quality Gates**: Guarantees that code changes made by AI agents or developers do not break downstream consumers before merging. |
| **[Model Context Protocol (MCP)](https://modelcontextprotocol.io/)** | Universal open protocol connecting AI models to external developer tools. | **Unified Multi-Agent Tool Router**: Exposes system capabilities (Knowledge Graph, IDE Breakpoints, Kubernetes Deployments, Database Consoles) to Claude Code, Google Antigravity, Copilot CLI, and Gemini. |
| **[Kubernetes & Helm](https://kubernetes.io/)** | Cloud-native container orchestration and package management. | **Declarative GitOps Infrastructure**: Visual architecture nodes automatically generate deployable Kubernetes manifests and Helm charts stored in `.robos/`. |
| **[Piper Neural TTS](https://github.com/rhasspy/piper)** | Fast, lightweight, offline neural text-to-speech synthesis engine. | **Automated Video Proof-of-Work Voiceovers**: Synthesizes natural spoken voiceovers and WebVTT subtitles for all 1080p verification walkthroughs. |

---

## Installation & Getting Started

Choose the installation method that fits your workflow:

### ⭐️ Primary Option: Install on Your Current Ubuntu GNOME Desktop
Deploy all 30+ RobOS applications, GNOME desktop launchers, and shared libraries directly onto your existing Ubuntu machine (Ubuntu 22.04, 24.04, or 26.04):

```bash
# 1. Clone the repository
git clone https://github.com/nddipiazza/robos.git
cd robos

# 2. Audit and install developer dependencies
node scripts/install-dev-deps.js

# 3. Install all applications and desktop integration to /usr/local/share/robos/
sudo bash packages/desktop-shell/install.sh
```

### Option 2: Dedicated RobOS Ubuntu Distro (Virtual Machine or Bare Metal)
Build a complete bootable Ubuntu developer OS image (flashable to USB via Rufus or Etcher) or launch inside a local QEMU/KVM virtual machine:

```bash
# Build the disk image + cloud-init ISO
infra/desktop/build.sh

# Run local VM (16 GB RAM, all host CPUs, SSH port 2224, VNC port 5910)
infra/desktop/run.sh
```

### Option 3: Cross-Platform Roadmap
- **Linux (Available Now)**: Run all 30+ native Electron developer applications with Node.js 20+.
- **macOS (Coming Soon)**: Universal `.dmg` installer and Homebrew Cask with native Apple Silicon support and menu bar launcher.
- **Windows (Coming Soon)**: One-click installer with WSL2 integration for isolated agent memory sandboxes.

---

## Next Steps

- **[Get Started Guide]({{ site.baseurl }}{% link getting-started.md %})**: Set up your development environment and launch your first RobOS app.
- **[App Development Flow]({{ site.baseurl }}{% link app-development-flow.md %})**: Learn the complete end-to-end development cycle.
- **[System Architecture]({{ site.baseurl }}{% link architecture.md %})**: Dive deep into the 8 architectural pillars and the Dual-State Comparison Engine.
- **[Browse All 30+ Apps]({{ site.baseurl }}{% link apps.md %})**: Explore the full catalog of RobOS developer tools.
- **[Real-World Walkthroughs]({{ site.baseurl }}{% link walkthroughs.md %})**: Watch high-definition video walkthroughs of real-world engineering scenarios.
