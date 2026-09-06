---
title: App Suite
layout: default
nav_order: 13
---

# RobOS App Suite
{: .no_toc }

30+ native developer desktop applications covering the complete software delivery lifecycle with zero framework overhead.
{: .fs-6 .fw-300 }

## Table of contents
{: .no_toc .text-delta }

1. TOC
{:toc}

---

## 1. Planning & Visual Architecture

### RobOS App Wizard (Greenfield & Brownfield Multi-App Scaffolding)
Scaffold brand-new applications or import existing repositories across 6 multi-app archetypes:
- **6 Supported Archetypes**: `robos:Microservice`, `robos:DesktopApp`, `robos:ConsoleApp`, `robos:MobileApp`, `robos:DataPipeline`, and `robos:Library`.
- **Greenfield Scaffolding**: Automatically generates runnable `dev-setup.sh`, Spotify Backstage `catalog-info.yaml`, CI/CD pipelines, Spectral-linted API contracts, and dual-state Knowledge Graph registrations.
- **Brownfield Codebase Ingestion**: Automatically scans existing directories, infers tech stacks (`package.json`, `pom.xml`, `go.mod`, `Cargo.toml`, `pyproject.toml`), and maps components into `.robos/packages.yaml` without manual YAML editing.
- **Dedicated Guides**: [Develop a New App]({{ '/new-app-wizard.html' | relative_url }}) and [Import Existing Apps]({{ '/app-import-wizard.html' | relative_url }}).
![RobOS App Wizard]({{ '/assets/images/screenshots/new-app-archetypes_frame.png' | relative_url }})

### RobOS Group Manager (Teams, Organizations & Enterprise Directory Sync)
Manage organizations, squads, enterprise directory sync, and user access control:
- **Enterprise Directory Sync**: Connects to Okta, Microsoft Entra ID (Azure AD), Google Workspace, and OpenLDAP via SCIM 2.0 and LDAP protocols.
- **Greenfield Startup Bootstrap**: Spin up brand-new tenants from scratch with root administrator setup, token vaulting, and automated VCS org provisioning.
- **Team Topologies**: First-class support for stream-aligned, platform, enablement, and complicated-subsystem squads saved to `.robos/teams.yaml`.
- **Active Identity Card**: Displays active signed-in user, roles, permissions, and company tenant status at all times.
- **Dedicated Guides**: [Existing Company Setup]({{ '/existing-company-setup.html' | relative_url }}) and [New Company Setup]({{ '/new-company-setup.html' | relative_url }}).
![RobOS Group Manager]({{ '/assets/images/screenshots/existing-company-directory-sync_frame.png' | relative_url }})

### System Topology & Visual Architecture Studio
A visual whiteboard for mapping your entire engineering architecture:
- **3-Level Visual Zoom**: Zoom from high-level personas (**Level 1: System Context**), down to microservices and databases (**Level 2: Containers**), to internal code modules (**Level 3: Components**).
- **Service Catalog Discovery**: Reads existing Spotify Backstage `catalog-info.yaml` files across Git repositories to automatically populate service ownership and dependencies.
- **Automatic Cloud Manifests**: Adding a new database or service to the canvas automatically creates ready-to-deploy Kubernetes YAML manifests and Helm charts.
![System Topology]({{ '/assets/images/screenshots/topology-db-c4_polyglot_frame.png' | relative_url }})

### Task Planner & Project Breakdown
Tell the AI what you want to build in plain English. RobOS breaks your goal down into an ordered, step-by-step roadmap of tasks and automatically synchronizes tickets to GitHub Issues, Gitea, or Jira.
![Task Planner]({{ '/assets/images/screenshots/acme-petshop-step1-dag_frame.png' | relative_url }})

### Contract Studio & Live API Mocks
Design and validate how your services talk to each other before writing code. Supports REST APIs (OpenAPI 3.1) and event streams (AsyncAPI) with live mock servers so frontend teams can build user interfaces immediately.
![Contract Studio]({{ '/assets/images/screenshots/acme-petshop-step3-studio_open_frame.png' | relative_url }})

### Git Projects Multi-Repo Hub
Connect all your company's Git repositories in one place. RobOS securely injects environment passwords from your encrypted vault and writes one-click setup scripts (`dev-setup.sh`) to get code building in seconds.
![Git Projects]({{ '/assets/images/screenshots/acme-petshop-step4-projects_open_frame.png' | relative_url }})

### Dev Central (Developer Command Center)
Your daily engineering dashboard: sprint progress, pull request health, daily calendar, AI standup notes, and blocker radar.
![Dev Central]({{ '/assets/images/screenshots/dev-central.png' | relative_url }})

---

## 2. Databases & API Testing Suite

### RobOS Relational DB Manager (PostgreSQL, MySQL, Oracle)
A fast database manager (inspired by DBeaver & DataGrip) with live table schema browsing, interactive data grids, multi-tab SQL console queries, and automated database creation (DDL) scripts.
![Relational DB Manager]({{ '/assets/images/screenshots/dev-tools-table_data_grid_frame.png' | relative_url }})

### RobOS NoSQL DB Manager (MongoDB & Redis)
Inspect JSON documents, query collections, and explore Redis key-value stores with live TTL expiration monitoring.
![NoSQL DB Manager]({{ '/assets/images/screenshots/dev-tools-db_manager_overview_frame.png' | relative_url }})

### RobOS REST API Client
A Git-backed API testing client storing plain-text `.bru` request files directly in your Git repository with automated request synthesis from OpenAPI contracts.
![REST API Client]({{ '/assets/images/screenshots/acme-petshop-step11-collections_tree_frame.png' | relative_url }})

### RobOS REST Collection Runner
Run entire suites of API requests in sequence, benchmark endpoint latency, test edge cases, and enforce quality gates for pull requests.
![REST Collection Runner]({{ '/assets/images/screenshots/acme-petshop-step12-runner_view_frame.png' | relative_url }})

### RobOS Data Sources Explorer
Explore all your company's databases, AWS S3 cloud storage buckets, and Kafka streaming topics with live connection testing and schema viewers.
![Data Sources]({{ '/assets/images/screenshots/data-sources-postgres_overview_frame.png' | relative_url }})

---

## 3. Code Review, Testing & Cloud Infrastructure

### RobOS Agent-Generated Code Review Platform
Autonomous AI-driven code review and audit hub for pull requests. Analyzes pull requests created by AI agents or human developers, provides side-by-side color-coded diffs, runs automatic security audits, tests OpenAPI contract compatibility, and connects directly with your preferred IDE via native plugins:
- **IntelliJ IDEA Pull Request Review Plugin**: Communicates over RobOS port `63343` IPC bridge and native JetBrains CLI integration to jump straight to modified files, set live breakpoints at change sites, and launch JetBrains' native Pull Request review tool window.
- **VS Code Pull Request Review Plugin**: Deeply integrates with the industry-standard `GitHub Pull Requests and Issues` extension (`vscode://github.vscode-pull-request-github/open-pr`) to review diffs, leave inline line comments, and approve PRs right inside Visual Studio Code.
![PR Review]({{ '/assets/images/screenshots/acme-petshop-step6-files_diff_frame.png' | relative_url }})

### Kube Studio & Cloud Infrastructure Navigator
A visual control room for Kubernetes clusters (local Kind clusters, AWS EKS, Google Cloud GKE, Azure AKS). View running containers, inspect Helm releases, check ArgoCD GitOps status, and stream live server logs.
![Kube Studio]({{ '/assets/images/screenshots/topology-db-datasource_synthesized_frame.png' | relative_url }})

### Deploy Tracker
Track your deployments across Development, Staging, and Production environments in real time with canary rollouts, team health metrics (DORA metrics), and one-click rollbacks.
![Deploy Tracker]({{ '/assets/images/screenshots/acme-petshop-step7-kpis_frame.png' | relative_url }})

### CI Monitor
Real-time continuous integration pipeline monitoring with automated AI root-cause explanations and one-click failure reruns.
![CI Monitor]({{ '/assets/images/screenshots/acme-petshop-step6-ci_checks_frame.png' | relative_url }})

---

## 4. AI Assistants & System Tools

### Agents Manager & Universal AI Tool Connections (MCP)
Manage multiple AI coding agents (Claude Code, Google Antigravity, GitHub Copilot, Gemini) with secure Model Context Protocol (MCP) tool authentication and OAuth login popups.
![Agents Manager]({{ '/assets/images/screenshots/agent-mcp-antigravity_servers_frame.png' | relative_url }})

### Live Architecture Knowledge Graph Explorer
Explore the full connected map of your software ecosystem with visual comparisons between live production (`main`) and proposed feature branches.
![Knowledge Graph]({{ '/assets/images/screenshots/robos-graph-frame_01.png' | relative_url }})

### Data Model Studio (TypeSpec)
Define your domain models once in Microsoft TypeSpec; RobOS automatically generates matching TypeScript interfaces, Java Records, and Go structs.
![Schema Studio]({{ '/assets/images/screenshots/schema-studio-frame_01.png' | relative_url }})
