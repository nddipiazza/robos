---
title: User Personas
layout: default
nav_order: 7
---

# User Personas & Workflows
{: .no_toc }

RobOS serves distinct engineering roles across the Software Delivery Lifecycle, transforming human developers into Lead Architects and Reviewers while autonomous agents execute the heavy lifting.
{: .fs-6 .fw-300 }

## Table of contents
{: .no_toc .text-delta }

1. TOC
{:toc}

---

## 1. Lead Architect / Tech Lead

### Role & Objectives
Defines high-level system architecture, evaluates blast radius, reviews API contracts, and guides autonomous AI agent implementation plans before any code is merged.

### Daily Applications
- **System Topology Studio**: Model C4 Level 1-3 architecture, inspect microservices, and auto-synthesize Kubernetes Helm charts.
- **Contract Studio**: Author and govern OpenAPI 3.1, TypeSpec, and AsyncAPI definitions with live linting and mock servers.
- **Dev Central & PR Review Board**: Conduct interactive `/grill-me` design interviews, inspect AI semantic diffs, and approve changes with one click.

### Typical Workflow
1. **Model System Architecture**: Visualizes new microservices or database dependencies in System Topology Studio.
2. **Review AI Proposals**: When an agent picks up a task, the architect reviews the agent's architectural solution plan and evaluates schema impact in the Knowledge Graph.
3. **Approve & Release**: Reviews the agent's narrated E2E video proof and approves the PR.

---

## 2. Software Engineer / Developer

### Role & Objectives
Focuses on deep domain logic, debugging complex edge cases, and steering autonomous agent swarms through task delivery.

### Daily Applications
- **Issue Manager & Task Board**: Pick up tasks with automatic workspace provisioning and DAG dependency resolution.
- **Git Projects**: Multi-repository synchronization, AI-generated `dev-setup.sh` scripts, and GPG secret management.
- **Developer Protocol Suite**: RobOS Relational DB Manager (Postgres, MySQL, Oracle), NoSQL DB Manager (MongoDB, Redis), gRPC Client, GraphQL Client, and Bruno REST Client.
- **IntelliJ IDEA IPC Bridge**: Automatically brought to the exact breakpoint where issues reproduce.

### Typical Workflow
1. **Task Pickup**: Selects a task; RobOS auto-checks out branches, provisions devcontainers, and hits the reproduction breakpoint.
2. **AI Solution Review**: Reviews and refines the AI's proposed solution before authorizing code generation.
3. **Interactive Verification**: Uses Relational DB Manager and Bruno REST Client to inspect data state and verify live endpoints.

---

## 3. DevOps & Platform Engineer

### Role & Objectives
Manages multi-cluster Kubernetes deployments, GitOps synchronization, data sources, and Model Context Protocol (MCP) tooling registries.

### Daily Applications
- **Kube Studio**: Multi-cluster Kubernetes management (Kind, EKS, GKE, AKS), Helm release matrices, and live container log streaming.
- **RobOS Data Sources**: Knowledge Graph data source connector for SQL, NoSQL, AWS S3 storage buckets, and Kafka streaming topics.
- **MCP Manager**: Discover, configure, and authenticate MCP tool servers across Anthropic Claude, Google Antigravity, Copilot CLI, and Gemini with OAuth popups.
- **Deploy Tracker & CI Monitor**: Track progressive canary rollouts, DORA metrics, and automated pipeline diagnosis.

### Typical Workflow
1. **Cluster & Data Source Provisioning**: Adds new Kubernetes clusters and registers databases in Knowledge Graph Data Sources.
2. **MCP Tool Server Governance**: Configures secure MCP tool bridges and validates OAuth authentication.
3. **Continuous Deployment Monitoring**: Observes automated ephemeral deployments and container log streams in Kube Studio.

---

## 4. Product Owner / Engineering Manager

### Role & Objectives
Transforms customer requirements into structured, DAG-linked task backlogs, tracks sprint health, and monitors release velocity without interrupting engineers.

### Daily Applications
- **Dev Central**: High-level daily dashboard with sprint status, PR health, blocker radar, and release timelines.
- **Issue Manager**: Natural language task breakdown into dependency DAGs synchronized with Gitea and Jira.
- **Deploy Tracker**: Real-time deployment timeline and DORA metric KPIs (Deployment Frequency, Lead Time, MTTR, Change Failure Rate).

### Typical Workflow
1. **Goal Breakdown**: Types a natural language feature goal; RobOS generates a structured DAG of interdependent user stories.
2. **Sprint & Velocity Oversight**: Monitors automated task movement and blocker radar on the Dev Central dashboard.
3. **Release Audit**: Inspects changelogs and verified video walkthroughs before production rollout.
