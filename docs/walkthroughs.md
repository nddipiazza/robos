---
title: E2E Walkthroughs & Proof of Work
layout: default
nav_order: 5
---

# E2E Walkthroughs & Proof of Work
{: .no_toc }

Every RobOS capability is validated through containerized headless E2E test suites with automated video capture, neural voiceovers, and DOM snapshot inspection across verified scenario walkthroughs.
{: .fs-6 .fw-300 }

## Table of contents
{: .no_toc .text-delta }

1. TOC
{:toc}

---

## The End-to-End Driven Development (EDD) Standard

In RobOS, tests are not an afterthought — they are the primary driver of development. Every feature increment is executed against an automated harness:

1. **Headless Compositor (`Xvfb + Picom`)**: Runs at 1920x1080 resolution with hardware compositing emulation.
2. **DOM Snapshot Inspection**: Evaluates DOM hierarchy via snapshot CLI ports (`19100–19182`).
3. **Synchronized Video Generation**: Records 1080p WebM videos with WebVTT subtitle tracks generated via offline Piper neural TTS.
4. **Walkthrough Recordings**: Test videos, WebVTT transcripts, and DOM assertions are bundled and verified with each task execution.

---

## Section 1: The 16-Step Acme Petshop Reference Lifecycle

The complete Acme Petshop multi-repo, polyglot microservice ecosystem proves out every stage of the software delivery lifecycle:

```mermaid
flowchart LR
    S1["1. Tasks DAG"] --> S2["2. Topology C4"]
    S2 --> S3["3. Contracts"]
    S3 --> S4["4. Git Projects"]
    S4 --> S5["5. IDE Breakpoint"]
    S5 --> S6["6. PR Review"]
    S6 --> S7["7. Deploy Tracker"]
    S7 --> S8["8. Kube Studio"]
    S8 --> S9["9. Real K8s"]
    S9 --> S10["10. Auto-Deploy"]
    S10 --> S11["11. Bruno REST"]
    S11 --> S12["12. Runner Gate"]
    S12 --> S13["13. MCP OAuth"]
    S13 --> S15["15. Data Sources"]
    S15 --> S16["16. DB & K8s Lifecycle"]
```

---

### Step 1: Task Planner & Gitea DAG Backlog
- **Scope**: Natural language task breakdown into a directed acyclic graph (DAG) of interdependent tasks, synchronized bi-directionally with Gitea and Jira.
- **Test File**: [`packages/robos-test/demos/acme-petshop-step1-tasks-demo.js`](https://github.com/nddipiazza/robos/blob/main/packages/robos-test/demos/acme-petshop-step1-tasks-demo.js)

| Natural Language Goal Input | Generated Dependency DAG |
|:---:|:---:|
| ![AI Goal Prompt]({{ '/assets/images/screenshots/acme-petshop-step1-prompt_frame.png' | relative_url }}) | ![DAG Graph]({{ '/assets/images/screenshots/acme-petshop-step1-dag_frame.png' | relative_url }}) |

| Synced Task Statuses | Gitea Issue Sync |
|:---:|:---:|
| ![Synced Tasks]({{ '/assets/images/screenshots/acme-petshop-step1-synced_frame.png' | relative_url }}) | ![Gitea Sync]({{ '/assets/images/screenshots/acme-petshop-step1-chrome_gitea_frame.png' | relative_url }}) |

---

### Step 2: Polyglot System Topology & Backstage Catalog
- **Scope**: Interactive C4 architecture modeling (Level 1 Context to Level 3 Components), Backstage software catalog synchronization, OpenTelemetry tracing, and blast radius calculation.
- **Test File**: [`packages/robos-test/demos/acme-petshop-step2-topology-demo.js`](https://github.com/nddipiazza/robos/blob/main/packages/robos-test/demos/acme-petshop-step2-topology-demo.js)

| Polyglot C4 Architecture Canvas | Microservice Inspector & Blast Radius |
|:---:|:---:|
| ![Topology Canvas]({{ '/assets/images/screenshots/acme-petshop-step2-canvas_frame.png' | relative_url }}) | ![Service Inspector]({{ '/assets/images/screenshots/acme-petshop-step2-inspector_frame.png' | relative_url }}) |

| Declarative C4 Export | OpenTelemetry Live Traces |
|:---:|:---:|
| ![C4 Export]({{ '/assets/images/screenshots/acme-petshop-step2-c4_export_frame.png' | relative_url }}) | ![OTel Tracing]({{ '/assets/images/screenshots/acme-petshop-step2-otel_frame.png' | relative_url }}) |

---

### Step 3: Contract Studio, TypeSpec & AsyncAPI
- **Scope**: API contract-first design supporting OpenAPI 3.1, TypeSpec, and AsyncAPI with live Spectral linting, Prism mock servers, and automated breaking-change detection.
- **Test File**: [`packages/robos-test/demos/acme-petshop-step3-contracts-demo.js`](https://github.com/nddipiazza/robos/blob/main/packages/robos-test/demos/acme-petshop-step3-contracts-demo.js)

| Multi-Contract Studio Explorer | Event-Driven AsyncAPI Definitions |
|:---:|:---:|
| ![Contract Studio]({{ '/assets/images/screenshots/acme-petshop-step3-studio_open_frame.png' | relative_url }}) | ![AsyncAPI Editor]({{ '/assets/images/screenshots/acme-petshop-step3-events_asyncapi_frame.png' | relative_url }}) |

| Prism Mock Server Validation | Automated Contract Governance Passed |
|:---:|:---:|
| ![Prism Mock]({{ '/assets/images/screenshots/acme-petshop-step3-prism_mock_frame.png' | relative_url }}) | ![Governance Checks]({{ '/assets/images/screenshots/acme-petshop-step3-governance_passed_frame.png' | relative_url }}) |

---

### Step 4: Git Projects & Dev-Setup Automation
- **Scope**: Multi-repository synchronization, AI-generated `dev-setup.sh` environment runners, GPG-encrypted secrets management, and automated IDE launch configurations.
- **Test File**: [`packages/robos-test/demos/acme-petshop-step4-git-projects-demo.js`](https://github.com/nddipiazza/robos/blob/main/packages/robos-test/demos/acme-petshop-step4-git-projects-demo.js)

| Git Projects Multi-Repo Hub | AI-Generated Dev-Setup Scripts |
|:---:|:---:|
| ![Git Projects Hub]({{ '/assets/images/screenshots/acme-petshop-step4-projects_open_frame.png' | relative_url }}) | ![Dev Setup Script]({{ '/assets/images/screenshots/acme-petshop-step4-devsetup_frame.png' | relative_url }}) |

| Lifecycle Execution Hooks | GPG-Encrypted Secret Management |
|:---:|:---:|
| ![Setup Lifecycle]({{ '/assets/images/screenshots/acme-petshop-step4-devsetup_lifecycle_frame.png' | relative_url }}) | ![GPG Secrets]({{ '/assets/images/screenshots/acme-petshop-step4-secrets_gpg_frame.png' | relative_url }}) |

---

### Step 5: IDE Execution & Breakpoint Reproduction
- **Scope**: IntelliJ IDEA workspace provisioning, local IPC bridge (port 63343), automated run configuration generation, breakpoint reproduction, and AI solution plan review.
- **Test File**: [`packages/robos-test/demos/acme-petshop-step5-ide-execution-demo.js`](https://github.com/nddipiazza/robos/blob/main/packages/robos-test/demos/acme-petshop-step5-ide-execution-demo.js)

| IntelliJ IDEA Workspace Provisioning | Breakpoint Reproduction Hit |
|:---:|:---:|
| ![IDE Workspace]({{ '/assets/images/screenshots/acme-petshop-step5-ide_open_frame.png' | relative_url }}) | ![Breakpoint Hit]({{ '/assets/images/screenshots/acme-petshop-step5-breakpoint_frame.png' | relative_url }}) |

| Runtime Variable Inspection | AI Solution Plan Review |
|:---:|:---:|
| ![Variables Inspector]({{ '/assets/images/screenshots/acme-petshop-step5-debugger_vars_frame.png' | relative_url }}) | ![Plan Review]({{ '/assets/images/screenshots/acme-petshop-step5-ai_plan_review_frame.png' | relative_url }}) |

---

### Step 6: PR CI Review & AI Code Analysis
- **Scope**: Unified pull request review dashboard, AI-powered semantic diff analysis, security audit, automated CI check validation, and one-click merge approvals.
- **Test File**: [`packages/robos-test/demos/acme-petshop-step6-pr-ci-demo.js`](https://github.com/nddipiazza/robos/blob/main/packages/robos-test/demos/acme-petshop-step6-pr-ci-demo.js)

| Active PR Queue & Status | Side-by-Side Semantic Diff |
|:---:|:---:|
| ![PR Queue]({{ '/assets/images/screenshots/acme-petshop-step6-pr_list_frame.png' | relative_url }}) | ![Semantic Diff]({{ '/assets/images/screenshots/acme-petshop-step6-files_diff_frame.png' | relative_url }}) |

| AI Code Review & Risk Breakdown | Automated CI Check Suite |
|:---:|:---:|
| ![AI Review]({{ '/assets/images/screenshots/acme-petshop-step6-ai_review_frame.png' | relative_url }}) | ![CI Checks]({{ '/assets/images/screenshots/acme-petshop-step6-ci_checks_frame.png' | relative_url }}) |

---

### Step 7: Deploy Tracker & Progressive Rollouts
- **Scope**: Multi-environment deployment pipeline tracking (Development, Staging, Production), canary rollouts, DORA metrics KPI dashboards, and instant rollback triggers.
- **Test File**: [`packages/robos-test/demos/acme-petshop-step7-deploy-tracker-demo.js`](https://github.com/nddipiazza/robos/blob/main/packages/robos-test/demos/acme-petshop-step7-deploy-tracker-demo.js)

| DORA Metrics & Release KPIs | Staging Environment Deployment Filter |
|:---:|:---:|
| ![KPI Dashboard]({{ '/assets/images/screenshots/acme-petshop-step7-kpis_frame.png' | relative_url }}) | ![Staging Filter]({{ '/assets/images/screenshots/acme-petshop-step7-staging_filter_frame.png' | relative_url }}) |

| Production Environment Deployment Filter | Progressive Delivery Timeline |
|:---:|:---:|
| ![Production Filter]({{ '/assets/images/screenshots/acme-petshop-step7-prod_filter_frame.png' | relative_url }}) | ![Timeline View]({{ '/assets/images/screenshots/acme-petshop-step7-timeline_frame.png' | relative_url }}) |

---

### Step 8: Kube Studio & Cloud Infrastructure Navigator
- **Scope**: Multi-cluster Kubernetes management (Kind, EKS, GKE, AKS), Helm release matrices, ArgoCD GitOps sync, and live container log streaming.
- **Test File**: [`packages/robos-test/demos/acme-petshop-step8-kube-studio-demo.js`](https://github.com/nddipiazza/robos/blob/main/packages/robos-test/demos/acme-petshop-step8-kube-studio-demo.js)

| Real-Time Kubernetes Pods Grid | Helm Release Catalog & Versions |
|:---:|:---:|
| ![Pods Table]({{ '/assets/images/screenshots/acme-petshop-step8-pods_table_frame.png' | relative_url }}) | ![Helm Releases]({{ '/assets/images/screenshots/acme-petshop-step8-helm_releases_frame.png' | relative_url }}) |

| ArgoCD GitOps Sync Status | Live Container Log Streaming |
|:---:|:---:|
| ![ArgoCD GitOps]({{ '/assets/images/screenshots/acme-petshop-step8-argocd_gitops_frame.png' | relative_url }}) | ![Live Logs]({{ '/assets/images/screenshots/acme-petshop-step8-logs_stream_frame.png' | relative_url }}) |

---

### Step 9: Real Kubernetes Cluster Deployment
- **Scope**: Live deployment onto local Kind clusters, cluster health discovery, live namespace provisioning, and pod lifecycle verification.
- **Test File**: [`packages/robos-test/demos/acme-petshop-step9-real-kube-e2e-demo.js`](https://github.com/nddipiazza/robos/blob/main/packages/robos-test/demos/acme-petshop-step9-real-kube-e2e-demo.js)

| Connect Live Kubernetes Cluster | Automated Task-Driven Deploy |
|:---:|:---:|
| ![Add Cluster]({{ '/assets/images/screenshots/acme-petshop-step9-add_cluster_modal_frame.png' | relative_url }}) | ![Deploy Task]({{ '/assets/images/screenshots/acme-petshop-step9-deploying_task_frame.png' | relative_url }}) |

| Live Running Pods | Streaming Pod Logs Console |
|:---:|:---:|
| ![Live Pods]({{ '/assets/images/screenshots/acme-petshop-step9-live_pods_frame.png' | relative_url }}) | ![Pod Logs]({{ '/assets/images/screenshots/acme-petshop-step9-pod_logs_frame.png' | relative_url }}) |

---

### Step 10: Continuous Deployment & Automatic Reclaim
- **Scope**: Ephemeral microservice deployment upon PR merge, real-time log monitoring, and automated namespace reclamation after verification.
- **Test File**: [`packages/robos-test/demos/acme-petshop-step10-continuous-deploy-demo.js`](https://github.com/nddipiazza/robos/blob/main/packages/robos-test/demos/acme-petshop-step10-continuous-deploy-demo.js)

| Knowledge Graph Application Catalog | Auto-Deployed Microservice Pods |
|:---:|:---:|
| ![KG Apps Grid]({{ '/assets/images/screenshots/acme-petshop-step10-kgraph_apps_grid_frame.png' | relative_url }}) | ![Auto-Deployed Pods]({{ '/assets/images/screenshots/acme-petshop-step10-autodeployed_pods_frame.png' | relative_url }}) |

| Real-Time Execution Logs | Clean Ephemeral Reclamation |
|:---:|:---:|
| ![Live Execution Logs]({{ '/assets/images/screenshots/acme-petshop-step10-live_logs_frame.png' | relative_url }}) | ![Reclaimed Namespace]({{ '/assets/images/screenshots/acme-petshop-step10-empty_reclaimed_frame.png' | relative_url }}) |

---

### Step 11: Bruno-Powered REST API Client & `.bru` Synthesis
- **Scope**: Git-backed REST collection editor, automatic synthesis of `.bru` files from OpenAPI specifications, environment variable management, and automated test assertions.
- **Test File**: [`packages/robos-test/demos/acme-petshop-step11-bruno-rest-client-demo.js`](https://github.com/nddipiazza/robos/blob/main/packages/robos-test/demos/acme-petshop-step11-bruno-rest-client-demo.js)

| Git-Backed Collection Tree | Automated `.bru` Synthesis |
|:---:|:---:|
| ![Collection Tree]({{ '/assets/images/screenshots/acme-petshop-step11-collections_tree_frame.png' | relative_url }}) | ![Synthesize Bru]({{ '/assets/images/screenshots/acme-petshop-step11-synthesize_bru_frame.png' | relative_url }}) |

| Live HTTP 200/201 Responses | Declarative Assertion Rules |
|:---:|:---:|
| ![Live Response]({{ '/assets/images/screenshots/acme-petshop-step11-live_response_frame.png' | relative_url }}) | ![Assertions]({{ '/assets/images/screenshots/acme-petshop-step11-test_assertions_frame.png' | relative_url }}) |

---

### Step 12: REST Collection Runner & PR Verification Gate
- **Scope**: Headless and interactive REST collection suite execution, environment matrices, latency scorecards, and PR verification quality gates.
- **Test File**: [`packages/robos-test/demos/acme-petshop-step12-collection-runner-demo.js`](https://github.com/nddipiazza/robos/blob/main/packages/robos-test/demos/acme-petshop-step12-collection-runner-demo.js)

| Multi-Request Collection Runner | Real-Time Execution Progress |
|:---:|:---:|
| ![Runner View]({{ '/assets/images/screenshots/acme-petshop-step12-runner_view_frame.png' | relative_url }}) | ![Execution Progress]({{ '/assets/images/screenshots/acme-petshop-step12-execution_progress_frame.png' | relative_url }}) |

| Test Results Matrix & Latency | Publish PR Verification Quality Gate |
|:---:|:---:|
| ![Results Matrix]({{ '/assets/images/screenshots/acme-petshop-step12-results_matrix_frame.png' | relative_url }}) | ![PR Gate]({{ '/assets/images/screenshots/acme-petshop-step12-publish_pr_gate_frame.png' | relative_url }}) |

---

### Step 13: Model Context Protocol (MCP) Agent Management
- **Scope**: Model Context Protocol tool server discovery, configuration, and interactive OAuth popup authentication across Anthropic Claude, Google Antigravity, Copilot CLI, and Gemini.
- **Test File**: [`packages/robos-test/demos/acme-petshop-step13-agy-mcp-task-demo.js`](https://github.com/nddipiazza/robos/blob/main/packages/robos-test/demos/acme-petshop-step13-agy-mcp-task-demo.js)

| Google Antigravity MCP Registry | Add Custom MCP Tool Server |
|:---:|:---:|
| ![Antigravity MCP]({{ '/assets/images/screenshots/agent-mcp-antigravity_servers_frame.png' | relative_url }}) | ![Add Server Modal]({{ '/assets/images/screenshots/agent-mcp-add_modal_frame.png' | relative_url }}) |

| Interactive OAuth Web Authentication | Local RobOS MCP IPC Bridge Connected |
|:---:|:---:|
| ![OAuth Modal]({{ '/assets/images/screenshots/agent-mcp-auth_modal_frame.png' | relative_url }}) | ![Localhost MCP]({{ '/assets/images/screenshots/agent-mcp-localhost_robos_frame.png' | relative_url }}) |

---

### Step 15: RobOS Data Sources Multi-Database Explorer
- **Scope**: Knowledge Graph data sources explorer connecting PostgreSQL, MySQL, Oracle, AWS S3 storage buckets, and Kafka streaming topics with live connection handshakes and query consoles.
- **Test File**: [`packages/robos-test/demos/data-sources-demo.js`](https://github.com/nddipiazza/robos/blob/main/packages/robos-test/demos/data-sources-demo.js)

| PostgreSQL Connection Overview | Live Table Schema Inspector |
|:---:|:---:|
| ![PostgreSQL Overview]({{ '/assets/images/screenshots/data-sources-postgres_overview_frame.png' | relative_url }}) | ![Schema Inspector]({{ '/assets/images/screenshots/data-sources-schema_inspector_frame.png' | relative_url }}) |

| Interactive Query Console Results | AWS S3 Cloud Storage Explorer |
|:---:|:---:|
| ![Query Results]({{ '/assets/images/screenshots/data-sources-query_results_frame.png' | relative_url }}) | ![AWS S3 Explorer]({{ '/assets/images/screenshots/data-sources-s3_storage_frame.png' | relative_url }}) |

---

### Step 16: Developer Tools Suite & Topology Database Kubernetes Lifecycle
- **Scope**: Full lifecycle spanning developer protocol clients (Relational DB Manager, NoSQL DB Manager, gRPC Client, GraphQL Client) and adding a new PostgreSQL Analytics Database into the Knowledge Graph, auto-synthesizing Kubernetes manifests, deploying to the cluster, seeding test records, and verifying live API endpoints.
- **Test File**: [`packages/robos-test/demos/topology-db-kube-lifecycle-demo.js`](https://github.com/nddipiazza/robos/blob/main/packages/robos-test/demos/topology-db-kube-lifecycle-demo.js)

| System Topology with Analytics Database | Impact & Blast Radius Inspector |
|:---:|:---:|
| ![C4 Polyglot Database Node]({{ '/assets/images/screenshots/topology-db-c4_polyglot_frame.png' | relative_url }}) | ![Blast Radius]({{ '/assets/images/screenshots/topology-db-inspector_blast_radius_frame.png' | relative_url }}) |

| Synthesized Kubernetes & Helm Manifests | Relational DB Manager SQL Console |
|:---:|:---:|
| ![K8s Synthesis]({{ '/assets/images/screenshots/topology-db-datasource_synthesized_frame.png' | relative_url }}) | ![SQL Console]({{ '/assets/images/screenshots/dev-tools-sql_console_query_frame.png' | relative_url }}) |

| Live Table Data Grid & Insertions | Generated DDL Script Inspector |
|:---:|:---:|
| ![Table Grid]({{ '/assets/images/screenshots/dev-tools-table_data_grid_frame.png' | relative_url }}) | ![DDL Inspector]({{ '/assets/images/screenshots/dev-tools-table_ddl_frame.png' | relative_url }}) |

---

## Section 2: Core Platform Subsystems & Subagent Scenarios

Beyond the reference petshop application, each RobOS core subsystem has dedicated verified scenario test runners:

### SDLC Knowledge Graph & Dual-State Diff Engine
- **Scope**: OSLC Core 3.0 / W3C JSON-LD graph parsing, multi-branch world state versioning, Gherkin BDD scenario linking, and AI-assisted graph queries.
- **Test Files**: [`robos-graph-demo.js`](https://github.com/nddipiazza/robos/blob/main/packages/robos-test/demos/robos-graph-demo.js), [`graph-diff-demo.js`](https://github.com/nddipiazza/robos/blob/main/packages/robos-test/demos/graph-diff-demo.js), [`gitops-schema-demo.js`](https://github.com/nddipiazza/robos/blob/main/packages/robos-test/demos/gitops-schema-demo.js), [`graph-copilot-demo.js`](https://github.com/nddipiazza/robos/blob/main/packages/robos-test/demos/graph-copilot-demo.js)

| SDLC Knowledge Graph Explorer | Dual-State Graph Semantic Diff |
|:---:|:---:|
| ![Knowledge Graph]({{ '/assets/images/screenshots/robos-graph-frame_01.png' | relative_url }}) | ![Graph Diff]({{ '/assets/images/screenshots/robos-graph-frame_02.png' | relative_url }}) |

---

### Ephemeral Linux Profiles & Zero-Residue Isolation
- **Scope**: Creation and destruction of sandboxed Linux agent profiles backed by `tmpfs` in-memory filesystems with direct host X11/Wayland display forwarding.
- **Test Files**: [`robos-profiled-demo.js`](https://github.com/nddipiazza/robos/blob/main/packages/robos-test/demos/robos-profiled-demo.js), [`robos-profiled-tmpfs-demo.js`](https://github.com/nddipiazza/robos/blob/main/packages/robos-test/demos/robos-profiled-tmpfs-demo.js), [`robos-profiled-display-demo.js`](https://github.com/nddipiazza/robos/blob/main/packages/robos-test/demos/robos-profiled-display-demo.js), [`robos-profiled-zero-residue-demo.js`](https://github.com/nddipiazza/robos/blob/main/packages/robos-test/demos/robos-profiled-zero-residue-demo.js)

| Ephemeral Profile Manager | Tmpfs Memory Mount & Zero-Residue Cleanup |
|:---:|:---:|
| ![Profile Manager]({{ '/assets/images/screenshots/robos-profiled-frame_01.png' | relative_url }}) | ![Tmpfs Zero Residue]({{ '/assets/images/screenshots/robos-profiled-zero-residue-frame_02.png' | relative_url }}) |

---

### Desktop Agents Daemon & Process Supervision
- **Scope**: Multi-agent process lifecycle management, terminal multiplexing, agent status telemetry, and host desktop sidebar docks.
- **Test Files**: [`robos-agentd-demo.js`](https://github.com/nddipiazza/robos/blob/main/packages/robos-test/demos/robos-agentd-demo.js), [`desktop-agents-demo.js`](https://github.com/nddipiazza/robos/blob/main/packages/robos-test/demos/desktop-agents-demo.js), [`agent-sidebar-demo.js`](https://github.com/nddipiazza/robos/blob/main/packages/robos-test/demos/agent-sidebar-demo.js), [`agent-session-lib-demo.js`](https://github.com/nddipiazza/robos/blob/main/packages/robos-test/demos/agent-session-lib-demo.js)

| Desktop Agent Session Console | Agent Process Supervisor |
|:---:|:---:|
| ![Agent Session]({{ '/assets/images/screenshots/robos-agent-session-frame_01.png' | relative_url }}) | ![Agent Supervisor]({{ '/assets/images/screenshots/robos-agentd-frame_01.png' | relative_url }}) |

---

### Model Context Protocol (MCP) Infrastructure
- **Scope**: Universal JSON-RPC MCP routing, tools discovery, live health checks, and cross-IDE communication.
- **Test Files**: [`mcp-manager-demo.js`](https://github.com/nddipiazza/robos/blob/main/packages/robos-test/demos/mcp-manager-demo.js), [`mcp-router-demo.js`](https://github.com/nddipiazza/robos/blob/main/packages/robos-test/demos/mcp-router-demo.js), [`mcp-lib-demo.js`](https://github.com/nddipiazza/robos/blob/main/packages/robos-test/demos/mcp-lib-demo.js), [`system-mcp-demo.js`](https://github.com/nddipiazza/robos/blob/main/packages/robos-test/demos/system-mcp-demo.js)

| MCP Router Console | Universal MCP Library Inspector |
|:---:|:---:|
| ![MCP Router]({{ '/assets/images/screenshots/robos-mcp-router-frame_01.png' | relative_url }}) | ![MCP Lib]({{ '/assets/images/screenshots/robos-mcp-lib-frame_01.png' | relative_url }}) |

---

### Entity Schema Studio, People & Package Management
- **Scope**: Microsoft TypeSpec schema compilation, team ownership mapping, devcontainer package runtimes, and workspace orchestrator.
- **Test Files**: [`schema-studio-demo.js`](https://github.com/nddipiazza/robos/blob/main/packages/robos-test/demos/schema-studio-demo.js), [`people-manager-demo.js`](https://github.com/nddipiazza/robos/blob/main/packages/robos-test/demos/people-manager-demo.js), [`package-manager-demo.js`](https://github.com/nddipiazza/robos/blob/main/packages/robos-test/demos/package-manager-demo.js), [`workspace-orchestrator-demo.js`](https://github.com/nddipiazza/robos/blob/main/packages/robos-test/demos/workspace-orchestrator-demo.js), [`task-dispatcher-demo.js`](https://github.com/nddipiazza/robos/blob/main/packages/robos-test/demos/task-dispatcher-demo.js), [`oss-adapters-demo.js`](https://github.com/nddipiazza/robos/blob/main/packages/robos-test/demos/oss-adapters-demo.js)

| Entity Schema Studio (TypeSpec) | Human & AI Personnel Roster |
|:---:|:---:|
| ![Schema Studio]({{ '/assets/images/screenshots/schema-studio-frame_01.png' | relative_url }}) | ![People Manager]({{ '/assets/images/screenshots/people-manager-frame_01.png' | relative_url }}) |

| App, Package & Runtime Manager | Multi-Repo Workspace Orchestrator |
|:---:|:---:|
| ![Package Manager]({{ '/assets/images/screenshots/package-manager-frame_01.png' | relative_url }}) | ![Workspace Orchestrator]({{ '/assets/images/screenshots/workspace-orchestrator-frame_01.png' | relative_url }}) |

| Open-Source Ecosystem Adapters | Dynamic DAG Task Dispatcher |
|:---:|:---:|
| ![OSS Adapters]({{ '/assets/images/screenshots/oss-adapters-frame_01.png' | relative_url }}) | ![Task Dispatcher]({{ '/assets/images/screenshots/task-dispatcher-frame_01.png' | relative_url }}) |

---

## Running the Automated Walkthrough Walkers

To re-run any walkthrough in headless mode and regenerate full videos with subtitles:

```bash
# Run full Acme Petshop lifecycle demo
xvfb-run -a -s "-screen 0 1920x1080x24" node packages/robos-test/demos/topology-db-kube-lifecycle-demo.js

# Run Data Sources explorer demo
xvfb-run -a -s "-screen 0 1920x1080x24" node packages/robos-test/demos/data-sources-demo.js

# Run Developer Tools Suite demo
xvfb-run -a -s "-screen 0 1920x1080x24" node packages/robos-test/demos/developer-tools-suite-demo.js

# Run MCP Agent Management demo
xvfb-run -a -s "-screen 0 1920x1080x24" node packages/robos-test/demos/agy-mcp-demo.js

# Run SDLC Knowledge Graph demo
xvfb-run -a -s "-screen 0 1920x1080x24" node packages/robos-test/demos/robos-graph-demo.js
```
