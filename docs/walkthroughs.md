---
title: E2E Walkthroughs & Proof of Work
layout: default
nav_order: 5
---

# E2E Walkthroughs & Proof of Work
{: .no_toc }

Every RobOS capability is validated through containerized headless E2E test suites with automated video capture, neural voiceovers, and DOM snapshot inspection.
{: .fs-6 .fw-300 }

## Table of contents
{: .no_toc .text-delta }

1. TOC
{:toc}

---

## The End-to-End Driven Development (EDD) Standard

In RobOS, tests are not an afterthought — they are the primary driver of development. Every feature increment runs against an automated harness:

1. **Headless Compositor (`Xvfb + Picom`)**: Runs at 1920x1080 resolution.
2. **DOM Snapshot Inspection**: Evaluates DOM hierarchy via snapshot CLI ports (`19100–19182`).
3. **Synchronized Video Generation**: Records 1080p WebM videos with WebVTT subtitle tracks generated via offline Piper neural TTS.
4. **Walkthrough Archive**: Automatically archived to `~/.robos/development/walkthroughs/<slug>/` with timestamped historical snapshots.

---

## Step-by-Step Verified Walkthroughs

### Step 16: System Topology Data Source & Kubernetes Deployment Lifecycle
- **Scope**: Adds a PostgreSQL 16 Analytics Warehouse node to the Knowledge Graph, auto-synthesizes Kubernetes manifests (`04-analytics-postgres.yaml`) and Helm templates, connects via RobOS Relational DB Manager (`db-manager`), executes SQL queries, and verifies the live REST endpoint (`GET /api/v1/analytics/adoptions`) with Bruno.
- **Test File**: `packages/robos-test/tests/e2e/topology-db-kube-lifecycle.test.js` (4/4 tests passed).
- **Artifacts**: `~/.robos/development/walkthroughs/acme-petshop-step16-topology-db-e2e/`

![System Topology Synthesis]({{ '/assets/images/screenshots/topology-db-datasource_synthesized_frame.png' | relative_url }})
![Relational DB Query Console]({{ '/assets/images/screenshots/dev-tools-table_data_grid_frame.png' | relative_url }})

---

### Step 15: RobOS Data Sources Multi-Database Explorer
- **Scope**: Knowledge Graph multi-database explorer supporting PostgreSQL, MySQL, Oracle, AWS S3 buckets, and Kafka streaming topics with live connection handshakes and query consoles.
- **Test File**: `packages/robos-test/tests/data-sources/data-sources.test.js`
- **Artifacts**: `~/.robos/development/walkthroughs/acme-petshop-step15-data-sources/`

![Data Sources Overview]({{ '/assets/images/screenshots/data-sources-postgres_overview_frame.png' | relative_url }})
![Data Sources Schema Inspector]({{ '/assets/images/screenshots/data-sources-schema_inspector_frame.png' | relative_url }})

---

### Step 14: RobOS Developer Tools Suite
- **Scope**: Four developer tools (Relational DB Manager, NoSQL DB Manager, gRPC Client, GraphQL Client) modeled after DBeaver, MongoDB Compass, BloomRPC, and GraphiQL.
- **Test File**: `packages/robos-test/tests/developer-tools/developer-tools-suite.test.js`
- **Artifacts**: `~/.robos/development/walkthroughs/acme-petshop-step16-developer-tools/`

![Developer Tools Suite]({{ '/assets/images/screenshots/dev-tools-db_manager_overview_frame.png' | relative_url }})

---

### Step 13: Model Context Protocol (MCP) Agent Management
- **Scope**: Discover, configure, and authenticate MCP tool servers across Anthropic Claude, Google Antigravity, Copilot CLI, and Gemini with interactive OAuth popup verification.
- **Test File**: `packages/robos-test/tests/mcp-servers/agy-mcp-workflow.test.js`
- **Artifacts**: `~/.robos/development/walkthroughs/agent-mcp-management/`

![Agent MCP Management]({{ '/assets/images/screenshots/agents-manager.png' | relative_url }})

---

### Step 8 & 9: Kube Studio & Cloud Infrastructure Navigator
- **Scope**: Multi-cluster Kubernetes management (Kind, EKS, GKE, AKS), ArgoCD GitOps sync, Helm release matrices, and live pod log streaming.
- **Test File**: `packages/robos-test/tests/kube-studio/kube-studio.test.js`
- **Artifacts**: `~/.robos/development/walkthroughs/acme-petshop-step8-kube-studio/`

![Kube Studio Pods]({{ '/assets/images/screenshots/deploy-tracker.png' | relative_url }})

---

### Step 5 & 6: IntelliJ IDE & PR Review Board
- **Scope**: Task workspace provisioning, IntelliJ IDEA IPC bridge (port 63343), breakpoint reproduction, automated code review, and 1-click merge approvals.
- **Test File**: `packages/robos-test/tests/pr-review/pr-review.test.js`
- **Artifacts**: `~/.robos/development/walkthroughs/acme-petshop-step6-pr-ci/`

![PR Review Board]({{ '/assets/images/screenshots/pr-review.png' | relative_url }})

---

## Running the Automated Walkthrough Walkers

To re-run any walkthrough and generate fresh video recordings:

```bash
# Run any demo runner in headless Xvfb
xvfb-run -a -s "-screen 0 1920x1080x24" node packages/robos-test/demos/topology-db-kube-lifecycle-demo.js
xvfb-run -a -s "-screen 0 1920x1080x24" node packages/robos-test/demos/data-sources-demo.js
xvfb-run -a -s "-screen 0 1920x1080x24" node packages/robos-test/demos/developer-tools-suite-demo.js
```
