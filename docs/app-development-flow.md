---
title: App Development Flow
layout: default
nav_order: 7
---

# The Flow of RobOS Apps Used to Create an Application
{: .no_toc }

The complete step-by-step developer journey: from establishing your organization identity in Group Manager, scaffolding or importing codebases in App Wizard, through visual architecture, breakpoint debugging, IDE pull request reviews, and live cloud deployment.
{: .fs-6 .fw-300 }

## Table of contents
{: .no_toc .text-delta }

1. TOC
{:toc}

---

## Overview: The Power of an Integrated App Lifecycle

In traditional software development, engineering teams juggle a fragmented maze of disconnected browser tabs, desktop windows, and terminal tools: Jira or GitHub for tickets, Figma or Miro for architecture sketches, Postman for API testing, DBeaver for database queries, IntelliJ or VS Code for writing code, terminal scripts for Docker/Kubernetes, and cloud web consoles for monitoring deployments. 

Every time you switch between these separate tools, context is lost:
- Information entered in a task ticket never makes it to the API contract designer.
- Database schema changes made in a local console don't update the architecture diagram.
- AI coding assistants only see isolated file snippets without understanding system topology.
- Code reviews happen in web browsers disconnected from IDE symbol indexes and debugger breakpoints.

**RobOS changes this fundamentally.** RobOS provides a unified desktop operating system and application suite where **every tool shares the same underlying Git-backed architecture knowledge graph (`.robos/knowledge-graph.jsonld`)**.

```mermaid
flowchart TD
    subgraph P0 ["Phase 0: Organization & Identity Foundation"]
        P0_A["RobOS Group Manager & Security Setup<br/><i>(Enterprise Directory SCIM/LDAP Sync or Greenfield Bootstrap)</i>"]
    end

    subgraph P1 ["Phase 1: Component Scaffolding or Codebase Ingestion"]
        P1_A["RobOS App Wizard<br/><i>(Path A: 6 Archetypes Scaffolding | Path B: Deep Inspection with AI Refinement)</i>"]
    end

    subgraph P2 ["Phase 2: Task Planning & Visual System Architecture"]
        P2_A["Task Planner & Issue Manager<br/><i>(AI Prompt to OSLC 3.0 DAG & Issue Tickets)</i>"]
        P2_B["Topology Studio<br/><i>(C4 Architecture Model & Spotify Backstage catalog-info.yaml)</i>"]
        P2_A --> P2_B
    end

    subgraph P3 ["Phase 3: API Contracts & Live Mock Testing"]
        P3_A["Contract Studio<br/><i>(OpenAPI 3.1, Microsoft TypeSpec & Prism Mock Servers)</i>"]
    end

    subgraph P4 ["Phase 4: Multi-Repo Hub & Automated Dev Setup"]
        P4_A["Git Projects & GPG-Vaulted Environment<br/><i>(dev-setup.sh, GPG commit signing & pass vault)</i>"]
    end

    subgraph P5 ["Phase 5: Autonomous AI Implementation & Breakpoint Debugging"]
        P5_A["AI Coding Agent Swarms<br/><i>(Autonomous Implementation Plans, Test Verification & Breakpoint Debugger)</i>"]
    end

    subgraph P6 ["Phase 6: PR Review Process & The IDE Review Hub"]
        P6_A["RobOS Agent Code Review Platform<br/><i>(Automated AI Audits + Optional Review in IntelliJ / VS Code with Full Context)</i>"]
    end

    subgraph P7 ["Phase 7: Live Database Schema & Query Consoles"]
        P7_A["Relational DB Manager & NoSQL DB Manager<br/><i>(SQL Console, Data Grids & Automated DDL Migrations)</i>"]
    end

    subgraph P8 ["Phase 8: Git-Backed REST API Verification"]
        P8_A["REST API Client & Collection Runner<br/><i>(Bruno .bru Plain-Text Requests & Batch Verification)</i>"]
    end

    subgraph P9 ["Phase 9: Kubernetes & Cloud Infrastructure Navigator"]
        P9_A["Kube Studio & Deploy Tracker<br/><i>(Helm Releases, Pod Metrics, Live Logs & Canary Rollouts)</i>"]
    end

    subgraph P10 ["Phase 10: Runtime Operations & Autonomous Agent Swarms"]
        P10_A["Workflow Studio & Agents Manager<br/><i>(Dynamic Feature Flags, Cron Swarms & Automated Defect Ingestion)</i>"]
    end

    P0 --> P1
    P1 --> P2
    P2 --> P3
    P3 --> P4
    P4 --> P5
    P5 --> P6
    P6 --> P7
    P7 --> P8
    P8 --> P9
    P9 --> P10
    P10 -.->|"Defect Tickets & Tech Debt Sync"| P2_A
```

Below is the complete walkthrough of how developers and engineering teams use RobOS to build enterprise applications—illustrated by the real-world **Acme Pet Store Platform**—from Day-1 organization onboarding to live cloud operations.

---

## Phase 0: Organization & Identity Foundation

Before planning features or scaffolding microservices, RobOS establishes your cryptographic developer identity, organization structure, and team boundaries. RobOS never relies on hardcoded assumptions—it identifies you and your team through two top-level enterprise workflows:

```mermaid
flowchart TD
    Choice{"Organization Type?"}
    Choice -->|"Existing Enterprise"| PathExist["Existing Company Setup<br/><i>(SCIM 2.0 / Azure AD / Okta / LDAP Sync)</i>"]
    Choice -->|"New Greenfield Startup"| PathNew["New Company Setup<br/><i>(1-Click Company Bootstrap & Stream-Aligned Teams)</i>"]

    PathExist --> SyncTeams["Map Teams to Team Topologies<br/><i>(.robos/teams.yaml)</i>"]
    PathNew --> SyncTeams

    SyncTeams --> SecSetup["Security Setup<br/><i>(GPG Keypair, SSH Keys, pass Vault)</i>"]
    SecSetup --> Ready["Day-1 Developer Foundation Ready"]
```

### 1. Existing Company Setup (Enterprise Directory Sync)
If joining or setting up an established enterprise, developers launch **RobOS Group Manager** (`packages/group-manager`):
* Connects via **SCIM 2.0, Okta, Azure Active Directory, or LDAP**.
* Ingests corporate departments, roles, and developer memberships in real time.
* Organizes squads according to **Team Topologies** principles (*Stream-aligned, Platform, Enabling, Complicated-subsystem*) and writes directly to `.robos/teams.yaml`.
* Configures role-based access control (RBAC) and reviewer groups.
* [👉 **Read the Full Existing Company Setup Guide**]({{ site.baseurl }}{% link existing-company-setup.md %})

### 2. New Company Setup (Greenfield Bootstrap)
If launching a new company or startup from scratch:
* **Group Manager** provides a one-click **Company Bootstrap Wizard**.
* Instantly initializes the organization tenant, Git author identity, and foundational squads (*Order Stream Squad, Catalog Stream Squad, Core Platform Squad*).
* Automatically generates `.robos/topology.yaml` and `.robos/teams.yaml`.
* Pairs with **Security Setup** (`security-setup`) to generate personal GPG/SSH keypairs for hardware-verified Git commit signing and standard Unix `pass` vault integration.
* [👉 **Read the Full New Company Setup Guide**]({{ site.baseurl }}{% link new-company-setup.md %})

---

## Phase 1: Component Scaffolding or Codebase Ingestion

With organization and team identities established, developers provision their applications using the **RobOS App Wizard** (`packages/app-wizard`). Developers follow one of two standardized paths:

```mermaid
flowchart TD
    AppChoice{"Application Origin?"}
    AppChoice -->|"Brand New Project"| NewApp["Path A: Develop a New App<br/><i>(Greenfield Scaffolding across 6 Archetypes)</i>"]
    AppChoice -->|"Existing Codebase"| ImpApp["Path B: Import Existing Codebase<br/><i>(Brownfield Deep Inspection & AI Refinement)</i>"]

    NewApp --> GenMeta["Generate Backstage catalog-info.yaml<br/>& dev-setup.sh"]
    ImpApp --> AIInspect["Interactive Deep Inspection<br/><i>(Prompt Refinement with &lt;robos-ai-textarea&gt;)</i>"]
    AIInspect --> GenMeta

    GenMeta --> KGraphReg["Register in .robos/packages.yaml<br/>& Dual-State Knowledge Graph"]
```

### Path A: Develop a New App (Greenfield Scaffolding)
Developers generate a production-ready repository skeleton across **6 core multi-app archetypes**:
1. **Microservice & Web API** (`robos:Microservice`): Java Spring Boot, Node Fastify/Express, Go Gin, Python FastAPI. Includes OpenAPI 3.1 / TypeSpec contracts and Dockerfiles.
2. **Desktop Application** (`robos:DesktopApp`): Electron, Qt, GTK, or Tauri desktop clients.
3. **Console & CLI Tool** (`robos:ConsoleApp`): Go Cobra, Rust Clap, Node Commander terminal utilities.
4. **Mobile Application** (`robos:MobileApp`): React Native, Flutter, native iOS/Android.
5. **Data Pipeline & Worker** (`robos:DataPipeline`): Kafka Streams, Apache Spark, Celery workers.
6. **Library & SDK** (`robos:Library`): Reusable client SDKs, utility packages, and shared UI components.

The wizard creates Spotify Backstage `catalog-info.yaml`, Docker build manifests, `dev-setup.sh`, and maps the component to your team in `.robos/teams.yaml`.
* [👉 **Read the Full Develop a New App Guide**]({{ site.baseurl }}{% link new-app-wizard.md %})

### Path B: Import Existing Apps (Deep Inspection & AI Refinement)
For existing repositories, the **App Import Wizard** performs automated deep codebase inspection:
* Analyzes build manifests (`pom.xml`, `package.json`, `go.mod`, `Cargo.toml`, `requirements.txt`).
* Detects API specifications (`openapi.yaml`, `schema.graphql`, `*.proto`) and database migrations (Flyway, Liquibase, Prisma).
* **Interactive AI Prompt Refinement (`<robos-ai-textarea>`)**:
  
  ![Deep Inspection & AI Prompt Refinement]({{ '/assets/images/screenshots/import-app-deep-inspection_frame.png' | relative_url }})

  Developers can enter natural language instructions directly into the `<robos-ai-textarea>` prompt bar to refine detected configurations:
  - *"Treat this as a Microservice using Spring Boot instead of a library"*
  - *"Change the runtime stack to Node 20 with Fastify and TypeScript"*
  - *"Assign this component to team core-platform with package slug auth-gateway"*
* Clicking **Apply AI Refinement** updates the detected archetype, stack, and team assignment instantly before generating configuration files.
* Synthesizes missing Backstage `catalog-info.yaml`, `dev-setup.sh`, and registers the package in `.robos/packages.yaml`.
* [👉 **Read the Full Import Existing Apps Guide**]({{ site.baseurl }}{% link app-import-wizard.md %})

---

## Phase 2: Task Planning & Visual System Architecture

### Step 1: AI Task Planner & Backlog Breakdown

**Primary Application**: **`Task Planner`** *(with `Issue Manager`)*  
**Category**: Planning & Project Management  
**Open Standards**: OASIS OSLC 3.0 Change Management, GitHub REST API, Jira REST API

![Task Planner]({{ '/assets/images/screenshots/acme-petshop-step1-dag_frame.png' | relative_url }})

* **What Happens**: You type the high-level business goal into the AI prompt window (e.g., *"Build a distributed pet store web application with a Java Spring Boot backend, a PostgreSQL relational database, an mTLS rabies vaccination verification gateway, an interactive React frontend, and an analytics warehouse"*).
* **The App's Job**: The AI analyzes the requirements and breaks the project into an ordered, step-by-step dependency graph (**Directed Acyclic Graph / DAG**). It identifies prerequisite tasks (e.g., *"Database Schema must be defined before creating the REST API"*) and automatically syncs numbered tickets (e.g., `PET-101` through `PET-116`) to GitHub Issues or Jira.
* **Handoff to Next Step**: The generated task list and dependency graph are saved directly to `.robos/knowledge-graph.jsonld`, creating the blueprint for the architecture.

---

### Step 2: Visual Architecture & System Topology

**Primary Application**: **`Topology Studio`**  
**Category**: Visual Architecture & Modeling  
**Open Standards**: C4 Architecture Model (Levels 1–3), Spotify Backstage (`catalog-info.yaml`)

![Topology Studio]({{ '/assets/images/screenshots/topology-db-c4_polyglot_frame.png' | relative_url }})

* **What Happens**: You open **Topology Studio** to inspect and customize the visual system map.
* **The App's Job**: Reads the declarative Spotify Backstage `catalog-info.yaml` files to render a zoomable architecture diagram:
  * **Level 1 (System Context)**: Shows pet owners, veterinary clinics, and store staff interacting with the platform.
  * **Level 2 (Containers)**: Shows the React Web Frontend, the Pet Inventory Service, the PostgreSQL Database, the Apache Kafka Event Stream, and the Rabies Vaccine Gateway.
  * **Level 3 (Components)**: Shows internal controllers, repositories, and authentication filters.
* **Impact Analysis (Blast Radius)**: If you add a new analytics microservice or alter an API connection, RobOS immediately highlights every connected component in purple/red, showing what other services could be impacted before any code is written.
* **Handoff to Next Step**: Topology Studio writes clean `catalog-info.yaml` service manifests directly into the Git repositories.

---

## Phase 3: API Contracts & Live Mock Testing

### Step 3: Contract Studio & Live API Mock Testing

**Primary Application**: **`Contract Studio`**  
**Category**: API Design & Contract Testing  
**Open Standards**: OpenAPI 3.1, Microsoft TypeSpec, AsyncAPI, Prism Mock Servers

![Contract Studio]({{ '/assets/images/screenshots/acme-petshop-step3-studio_open_frame.png' | relative_url }})

* **What Happens**: Before writing backend Java code or frontend React components, you define the exact data structures and HTTP endpoints that services will use to communicate.
* **The App's Job**: Using **Microsoft TypeSpec** or **OpenAPI 3.1**, Contract Studio defines schemas for pets, orders, and vaccination certificates. It immediately spins up an instant **Prism Mock Server** on `http://localhost:4010`.
* **Why This Matters**: Frontend developers and AI agents can start building the React web UI against live mock data immediately, without waiting for the backend Java service to be written.
* **Handoff to Next Step**: Contract Studio saves `.tsp` data models and `openapi.yaml` contracts into the Git repository.

---

## Phase 4: Multi-Repo Hub & Automated Dev Setup

### Step 4: Multi-Repo Git Hub & Automated Dev Setup

**Primary Application**: **`Git Projects`**  
**Category**: Workspace & Repository Management  
**Open Standards**: Git, POSIX Shell, GPG Vault

![Git Projects]({{ '/assets/images/screenshots/acme-petshop-step4-git-projects-frame_01.png' | relative_url }})

* **What Happens**: You open the multi-repo management hub to link the frontend, backend, and infrastructure repositories together.
* **The App's Job**: **Git Projects** connects all related repositories in one window. It automatically generates a zero-friction developer setup script (`dev-setup.sh`) that installs dependencies, verifies runtime SDKs (Java JDK 21, Node.js 20, Docker), and securely pulls environment variables from your GPG-encrypted vault (`pass`).
* **Handoff to Next Step**: One click on a task ticket (e.g., `PET-105: Implement Vaccine Gateway`) provisions an isolated, clean Git branch workspace.

---

## Phase 5: Autonomous AI Implementation & Breakpoint Debugging

### Step 5: Autonomous AI Implementation & Automated Test Verification

**Primary Application**: **`AI Coding Agent & RobOS Swarm`** *(Claude Code, Antigravity, Copilot, Gemini)*  
**Category**: Development & Automated Implementation  
**Open Standards**: Model Context Protocol (MCP), Language Server Protocol (LSP), Git

![AI Implementation & Plan Review]({{ '/assets/images/screenshots/acme-petshop-step5-ai_plan_review_frame.png' | relative_url }})

* **What Happens**: The AI agent picks up the task ticket (`PET-105: Implement Vaccine Gateway`) from the backlog, provisions an isolated Git branch workspace, and formulates a concrete implementation plan.
* **The Agent's Job**:
  1. **Autonomous Code Generation**: Writes the required application logic, compiles TypeSpec data models, and configures endpoints (e.g. `VaccineGatewayClient.java`).
  2. **Automated Test Generation & Execution**: Synthesizes and executes unit tests, integration tests, and consumer-driven contract tests (Pact) against live mock servers.
  3. **Interactive Breakpoint Debugging Feature**: When reproducing a bug or investigating complex runtime state, RobOS agents can run a test and pause execution directly at a **live debugger breakpoint in the IDE**. This allows human engineers and autonomous agents to inspect live memory variables, stack traces, and local variables interactively.
* **Handoff to Next Step**: Once the code compiles and all test suites pass, the agent opens a Pull Request for human review.

---

## Phase 6: PR Review Process & The IDE Review Hub

### Step 6: PR Review Process & The IDE Review Hub

**Primary Application**: **`RobOS Agent Code Review Platform`** *(with `CI Monitor` & IDE Review Plugins)*  
**Category**: Human Review, Code Auditing & IDE Quality Gates  
**Open Standards**: Unified Git Diffs, GitHub Pull Requests, JetBrains IDE REST API, VS Code URI Scheme

![Agent Code Review Platform]({{ '/assets/images/screenshots/acme-petshop-step6-overview_frame.png' | relative_url }})

* **What Happens**: The human developer / lead architect reviews the AI-generated pull request before any code merges to `main`.
* **The RobOS Review Experience**:
  1. **Automated AI Security & Contract Audits**: The platform automatically audits modified code for cryptographic safety (e.g., mTLS keystore parsing), verifies 100% OpenAPI 3.1 Spectral schema compliance, and checks CI test rollups.
  2. **Reviewing in RobOS Desktop**: View side-by-side color-coded file diffs, chat with the AI reviewer to clarify implementation decisions, and inspect Knowledge Graph architecture diffs.
  3. **Optionally Reviewing in the IDE with Full Context in Tow**:
     * **IntelliJ IDEA Review Plugin**: Click **Review in IntelliJ** to dispatch port `63343` IPC, opening the branch straight into IntelliJ IDEA's native **Pull Request review tool window**. The developer reviews the PR with all rich IDE context in tow—symbol lookups, type checking, syntax highlighting, live debugging, and inline PR comments.
     * **VS Code Review Plugin**: Click **Review in VS Code** to trigger the standard `GitHub Pull Requests and Issues` extension (`vscode://github.vscode-pull-request-github/open-pr`), providing deep in-editor review capabilities.
* **One-Click Merge & Dual Sync**: Approving the PR merges the code into `main` and automatically synchronizes the system Knowledge Graph topology.
* **Handoff to Next Step**: The merged pull request triggers automated database migrations and deployment tracking.

---

## Phase 7: Live Database Schema & Query Consoles

### Step 7: Relational & NoSQL Database Consoles

**Primary Application**: **`Relational DB Manager`** *(with `NoSQL DB Manager` & `Data Sources Explorer`)*  
**Category**: Database Management & Data Modeling  
**Open Standards**: ANSI SQL, PostgreSQL Wire Protocol, MongoDB Wire Protocol, Redis RESP

![Relational DB Manager]({{ '/assets/images/screenshots/dev-tools-table_data_grid_frame.png' | relative_url }})

* **What Happens**: You inspect and manage the live databases backing the Acme Pet Store.
* **The App's Job**: Provides a responsive SQL console and table inspector (inspired by DBeaver and DataGrip):
  * Inspect table columns, foreign keys, and indexes for `pets`, `vaccination_records`, and `orders`.
  * Browse and edit table rows in an interactive data grid.
  * Run multi-tab SQL queries with instant syntax highlighting and execution timing.
  * Generate and apply automated database schema creation (DDL) and migration scripts.
* **Handoff to Next Step**: With the database schema active and populated with seed data, the live API endpoints can be tested.

---

## Phase 8: Git-Backed REST API Verification

### Step 8: Bruno-Powered REST API Client & Collection Runner

**Primary Application**: **`REST API Client`** *(with `REST Collection Runner`)*  
**Category**: API Testing & Microservice Verification  
**Open Standards**: Bruno (`.bru` plain text format), OpenAPI 3.1, HTTP/1.1 & HTTP/2

![REST API Client]({{ '/assets/images/screenshots/acme-petshop-step11-bruno-rest-client-frame_02.png' | relative_url }})

* **What Happens**: You verify that the live backend endpoints respond correctly to real HTTP requests.
* **The App's Job**: Powered by the open-source **Bruno** engine, the REST API Client organizes API tests into plain-text `.bru` files saved directly in your Git repository (no proprietary cloud sync):
  * Synthesizes ready-to-run API request suites from your OpenAPI specifications.
  * Executes automated test assertions (verifying status codes `200 OK`, JSON response payloads, and authorization headers).
  * Runs entire test suites in batch using the **Collection Runner** to benchmark latency and verify edge cases.
* **Handoff to Next Step**: With API endpoints verified, the application is packaged for containerized cloud deployment.

---

## Phase 9: Kubernetes & Cloud Infrastructure Navigator

### Step 9: Kube Studio & Cloud Infrastructure Navigator

**Primary Application**: **`Kube Studio`** *(with `Deploy Tracker`)*  
**Category**: Cloud Infrastructure & Container Orchestration  
**Open Standards**: Kubernetes API, Helm Charts, ArgoCD GitOps

![Kube Studio]({{ '/assets/images/screenshots/topology-db-datasource_synthesized_frame.png' | relative_url }})

* **What Happens**: You monitor the deployment of your microservices and databases to Kubernetes.
* **The App's Job**: **Kube Studio** acts as a visual control room for Kubernetes clusters (local Kind clusters, AWS EKS, Google Cloud GKE, or Azure AKS):
  * Automatically compiles the Backstage service topology into production-ready Kubernetes manifests and Helm release charts.
  * Displays running Pods, Deployments, ReplicaSets, and Ingress routes with live health status badges.
  * Streams real-time container log output and resource utilization metrics (CPU/RAM).
* **Deploy Tracker Integration**: Tracks release versions across Development, Staging, and Production with one-click canary rollouts and instant rollbacks.
* **Handoff to Next Step**: With the application running live in the cluster, runtime feature toggles and agent swarms are managed.

---

## Phase 10: Runtime Operations & Autonomous Agent Swarms

### Step 10: Workflow Studio & MCP Agent Swarms

**Primary Application**: **`Workflow Studio`** *(with `Agents Manager`)*  
**Category**: Automation & AI Agent Orchestration  
**Open Standards**: Model Context Protocol (MCP), OpenFeature Specification, JSON Schema

![Workflow Studio]({{ '/assets/images/screenshots/acme-petshop-step13-workflow_done_frame.png' | relative_url }})

* **What Happens**: You manage dynamic feature flags and orchestrate background AI agent swarms.
* **The App's Job**: 
  * **Workflow Studio** configures runtime feature toggles (e.g., enabling the *mTLS Rabies Vaccine Verification Gateway* with a single switch without redeploying code).
  * **Agents Manager** triggers background autonomous cron jobs and agent swarms (e.g., automated dependency vulnerability scanners, database performance profilers, and end-to-end regression runners) that communicate securely through local MCP endpoints.
* **Complete Lifecycle Loop**: Any bugs, security vulnerabilities, or performance bottlenecks discovered by the background agents are automatically formatted into new structured issue tickets and sent back to **Step 1 (Task Planner)**, closing the continuous development loop.

---

## Summary Table: The Complete Application Pipeline

| Phase | RobOS Application | Primary Purpose | Key Open Standard | Output Artifact |
|:---|:---|:---|:---|:---|
| **0. Foundation** | **Group Manager** (`group-manager` & `security-setup`) | Enterprise directory SCIM/LDAP sync, team topologies, GPG/SSH crypto keys | SCIM 2.0, LDAP, GPG, SSH, `pass` | `.robos/teams.yaml`, `~/.config/robos/` |
| **1. Provisioning** | **App Wizard** (`app-wizard`) | Greenfield scaffolding across 6 archetypes or deep brownfield inspection with AI refinement | Backstage `catalog-info.yaml`, OCI, TypeSpec | `dev-setup.sh`, `.robos/packages.yaml` |
| **2. Planning** | **Task Planner** (`issue-manager`) | Business prompt to ordered task roadmap & DAG | OASIS OSLC 3.0, GitHub Issues, Jira | `.robos/knowledge-graph.jsonld` |
| **3. Architecture** | **Topology Studio** | C4 multi-level visual system architecture & blast radius analysis | C4 Model, Spotify Backstage | `catalog-info.yaml` |
| **4. Contracts** | **Contract Studio** | API contracts & live mock server testing | OpenAPI 3.1, TypeSpec, Prism | `models.tsp`, `openapi.yaml` |
| **5. Repositories** | **Git Projects** | Multi-repo linking & automated dev setup | Git, POSIX Shell, GPG Vault | `dev-setup.sh` |
| **6. Coding** | **AI Coding Agent Swarm** | Autonomous code implementation, tests & live IDE breakpoint debugging | Model Context Protocol (MCP), LSP | Verified Code, Unit & Contract Tests |
| **7. Review** | **Agent Code Review Platform** | PR review with optional native IntelliJ / VS Code review with full context | Unified Diff, GitHub PR, JetBrains / VS Code | Merged Pull Request & KGraph Sync |
| **8. Databases** | **Relational DB Manager** | Schema explorer, data grid & SQL queries (PostgreSQL / MySQL / NoSQL) | ANSI SQL, JDBC, Redis | Migration DDL Scripts |
| **9. API Testing** | **REST API Client** | Git-backed request suites & batch runner | Bruno (`.bru`), HTTP/2 | `.bru` Plain-Text Collections |
| **10. Deployment** | **Kube Studio** | Kubernetes navigator, Helm management & canary rollouts | Kubernetes API, Helm, ArgoCD | Production Pods & Services |
| **11. Operations** | **Workflow Studio** | Feature toggles & autonomous background agent swarms | OpenFeature, MCP | Live Feature Flags & Automated Issues |

---

## What to Explore Next

Follow the four foundational onboarding and application provisioning guides, or see the entire sequence executed live in our video walkthroughs:

* [🏢 **Existing Company Setup Guide** (SCIM 2.0, LDAP, Team Topologies)]({{ site.baseurl }}{% link existing-company-setup.md %})
* [🚀 **New Company Setup Guide** (Greenfield Bootstrap & Tenant Init)]({{ site.baseurl }}{% link new-company-setup.md %})
* [✨ **Develop a New App Guide** (App Wizard & 6 Archetypes)]({{ site.baseurl }}{% link new-app-wizard.md %})
* [📦 **Import Existing Apps Guide** (Deep Inspection & AI Refinement)]({{ site.baseurl }}{% link app-import-wizard.md %})
* [👉 **Real-World E2E Walkthroughs & Proof of Work (The 16-Step Acme Petshop)**]({{ site.baseurl }}{% link walkthroughs.md %})
* [🏗️ **System Architecture & The Dual-State Comparison Engine**]({{ site.baseurl }}{% link architecture.md %})
* [🤖 **AI Agent Review-Based Software Development (The 5-Stage Lifecycle)**]({{ site.baseurl }}{% link agent-review-development.md %})
* [💻 **Browse All 30+ Applications in the RobOS Suite**]({{ site.baseurl }}{% link apps.md %})
