---
title: App Suite
layout: default
nav_order: 6
---

# RobOS App Suite
{: .no_toc }

30+ purpose-built Electron desktop applications covering the complete software delivery lifecycle with zero framework overhead.
{: .fs-6 .fw-300 }

## Table of contents
{: .no_toc .text-delta }

1. TOC
{:toc}

---

## 1. Core Planning & Architecture

### System Topology & Backstage Studio
Interactive C4 architecture modeling (Level 1 Context to Level 3 Components), Backstage software catalog explorer, blast radius calculation, and automatic Kubernetes Helm manifest synthesis.
![System Topology]({{ '/assets/images/screenshots/topology-db-c4_polyglot_frame.png' | relative_url }})

### Task Planner & DAG Dispatcher
Natural language task breakdown into directed acyclic graphs (DAG) of interdependent work items, auto-syncing with Gitea and Jira, with 1-click workspace provisioning.
![Task Planner]({{ '/assets/images/screenshots/acme-petshop-step1-dag_frame.png' | relative_url }})

### Contract Studio
API contract-first design supporting OpenAPI 3.1, TypeSpec, and AsyncAPI with live Spectral linting, Prism mock servers, and automated breaking-change detection.
![Contract Studio]({{ '/assets/images/screenshots/acme-petshop-step3-studio_open_frame.png' | relative_url }})

### Git Projects Multi-Repo Hub
Multi-repository synchronization, AI-generated `dev-setup.sh` environment runners, GPG-encrypted secrets management, and automated IDE launch configurations.
![Git Projects]({{ '/assets/images/screenshots/acme-petshop-step4-projects_open_frame.png' | relative_url }})

### Dev Central
The daily developer command center: sprint status, PR health, calendar, AI standup, and blocker radar.
![Dev Central]({{ '/assets/images/screenshots/dev-central.png' | relative_url }})

---

## 2. Developer Protocol & Database Suite

### RobOS Relational DB Manager
DBeaver and DataGrip-inspired database manager for PostgreSQL, MySQL, and Oracle. Live schema inspector, table data grid, multi-tab SQL console, query explain plans, and DDL generator.
![Relational DB Manager]({{ '/assets/images/screenshots/dev-tools-table_data_grid_frame.png' | relative_url }})

### RobOS NoSQL DB Manager
MongoDB Compass and RedisInsight-inspired manager with JSON document inspection, query filters, and Redis keyspace explorer with TTL monitoring.
![NoSQL DB Manager]({{ '/assets/images/screenshots/dev-tools-db_manager_overview_frame.png' | relative_url }})

### RobOS REST API Client (Bruno)
Git-backed REST collections (`.bru`), automatic synthesis from OpenAPI specs, environment matrices, and automated test assertions.
![REST API Client]({{ '/assets/images/screenshots/acme-petshop-step11-collections_tree_frame.png' | relative_url }})

### RobOS REST Collection Runner
Headless and interactive test suite runner, latency matrices, scorecards, and PR verification quality gates.
![REST Collection Runner]({{ '/assets/images/screenshots/acme-petshop-step12-runner_view_frame.png' | relative_url }})

### RobOS Data Sources Explorer
Knowledge Graph multi-database explorer connecting relational databases, document stores, AWS S3 buckets, and Kafka streaming topics.
![Data Sources]({{ '/assets/images/screenshots/data-sources-postgres_overview_frame.png' | relative_url }})

---

## 3. Code Review, Testing & Cloud Infrastructure

### PR Review Board
AI-assisted code review with change summaries, risk assessments, interactive breakpoint debugging, and one-click merge approvals.
![PR Review]({{ '/assets/images/screenshots/acme-petshop-step6-files_diff_frame.png' | relative_url }})

### Kube Studio & Cloud Infrastructure Navigator
Multi-cluster Kubernetes management (Kind, EKS, GKE, AKS), Helm release matrices, ArgoCD GitOps synchronization, and live container log streaming.
![Kube Studio]({{ '/assets/images/screenshots/topology-db-datasource_synthesized_frame.png' | relative_url }})

### Deploy Tracker
Multi-environment deployment pipeline tracking (Development, Staging, Production), canary rollouts, DORA metrics KPI dashboards, and instant rollback triggers.
![Deploy Tracker]({{ '/assets/images/screenshots/acme-petshop-step7-kpis_frame.png' | relative_url }})

### CI Monitor
Real-time pipeline monitoring with automated AI root-cause diagnosis and one-click failure reruns.
![CI Monitor]({{ '/assets/images/screenshots/ci-monitor.png' | relative_url }})

---

## 4. AI Agent Sessions & System Utilities

### Agents Manager & MCP Manager
Manage multi-agent sessions (Claude Code, Google Antigravity, Copilot CLI, Gemini) with interactive Model Context Protocol (MCP) server authentication and OAuth popups.
![Agents Manager]({{ '/assets/images/screenshots/agent-mcp-antigravity_servers_frame.png' | relative_url }})

### SDLC Knowledge Graph Explorer
Visual explorer for the OASIS OSLC / W3C JSON-LD system knowledge graph with dual-state semantic diffing.
![Knowledge Graph]({{ '/assets/images/screenshots/robos-graph-frame_01.png' | relative_url }})

### Entity Schema Studio (TypeSpec)
Microsoft TypeSpec schema modeler compiling domain types to TypeScript, Java, and Go DTO packages.
![Schema Studio]({{ '/assets/images/screenshots/schema-studio-frame_01.png' | relative_url }})

### Personnel & Roster Manager
Human and AI agent personnel directory with stream-aligned team models and tool capabilities.
![People Manager]({{ '/assets/images/screenshots/people-manager-frame_01.png' | relative_url }})

### Security Setup & Pass Manager
GPG-encrypted credential vault and first-run SSH key initialization for secure GitOps delivery.
![Security Setup]({{ '/assets/images/screenshots/security-setup.png' | relative_url }})

### App Launcher & Notifications
Instant searchable app launcher and real-time desktop notification daemon with audio cues.
![App Launcher]({{ '/assets/images/screenshots/app-launcher.png' | relative_url }})
