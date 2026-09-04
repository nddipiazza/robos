---
title: App Suite
layout: default
nav_order: 6
has_children: false
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

## 1. Core Planning & Orchestration

### App Launcher
Searchable grid of all installed RobOS applications with category filtering and keyboard shortcuts.
![App Launcher]({{ '/assets/images/screenshots/app-launcher.png' | relative_url }})

### Dev Central
The daily developer command center: sprint status, PR health, calendar, AI standup, and blocker radar.
![Dev Central]({{ '/assets/images/screenshots/dev-central.png' | relative_url }})

### System Topology & Backstage Studio
Interactive C4 architecture modeling (Level 1 Context to Level 3 Components), Backstage software catalog explorer, and automatic Kubernetes Helm manifest synthesis.
![System Topology]({{ '/assets/images/screenshots/topology-db-c4_polyglot_frame.png' | relative_url }})

### Issue Manager & Task Planner
GitHub and Jira client with Kanban boards, AI issue breakdown, DAG task dependencies, and workspace provisioning.
![Issue Manager]({{ '/assets/images/screenshots/issue-manager.png' | relative_url }})

---

## 2. Developer Protocol & Database Suite

### RobOS Relational DB Manager
DBeaver and DataGrip-inspired database manager for PostgreSQL, MySQL, and Oracle. Live schema inspector, table data grid, multi-tab SQL console, query explain plans, and DDL generator.
![Relational DB Manager]({{ '/assets/images/screenshots/dev-tools-table_data_grid_frame.png' | relative_url }})

### RobOS NoSQL DB Manager
MongoDB Compass and RedisInsight-inspired manager with JSON document inspection, query filters, and Redis keyspace explorer with TTL monitoring.
![NoSQL DB Manager]({{ '/assets/images/screenshots/dev-tools-db_manager_overview_frame.png' | relative_url }})

### RobOS gRPC Client
BloomRPC and Kreya-inspired Protobuf testing client. Proto reflection, unary and streaming RPC invocation, and JSON payload viewer.

### RobOS GraphQL Client
GraphiQL and Altair-inspired GraphQL client with schema introspection, query/mutation editor, variables runner, and live response viewer.

### RobOS REST API Client (Bruno)
Git-backed REST collections (`.bru`), collection runner, environment matrices, and automated test assertions.
![REST API Client]({{ '/assets/images/screenshots/data-sources-test_connection_frame.png' | relative_url }})

### RobOS Data Sources
Knowledge Graph multi-database explorer connecting relational databases, document stores, AWS S3 buckets, and Kafka streaming topics.
![Data Sources]({{ '/assets/images/screenshots/data-sources-postgres_overview_frame.png' | relative_url }})

---

## 3. Code Review, Testing & Infrastructure

### PR Review Board
AI-assisted code review with change summaries, risk assessments, interactive breakpoint debugging, and one-click approvals.
![PR Review]({{ '/assets/images/screenshots/pr-review.png' | relative_url }})

### Kube Studio & Cloud Infrastructure Navigator
Multi-cluster Kubernetes management (Kind, EKS, GKE, AKS), Helm release matrices, ArgoCD GitOps synchronization, and live container log streaming.
![Kube Studio]({{ '/assets/images/screenshots/topology-db-datasource_synthesized_frame.png' | relative_url }})

### CI Monitor
Real-time pipeline monitoring with automated AI root-cause diagnosis and one-click failure reruns.
![CI Monitor]({{ '/assets/images/screenshots/ci-monitor.png' | relative_url }})

---

## 4. AI Agent Sessions & Security

### Agents Manager & MCP Manager
Manage multi-agent sessions (Claude Code, Google Antigravity, Copilot CLI, Gemini) with interactive Model Context Protocol (MCP) server authentication and OAuth popups.
![Agents Manager]({{ '/assets/images/screenshots/agents-manager.png' | relative_url }})

### Context Manager
Curate AI context sources (files, URLs, repositories, tickets) and manage token budgets.
![Context Manager]({{ '/assets/images/screenshots/context-manager.png' | relative_url }})

### Pass Manager & Security Setup
GPG-encrypted credential vault and first-run SSH key initialization for secure GitOps delivery.
![Security Setup]({{ '/assets/images/screenshots/security-setup.png' | relative_url }})
