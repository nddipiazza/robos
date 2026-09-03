# Story 31.02: System Topology & Catalog Manager (Backstage / C4 Model)

**Epic:** [RobOS — Agent-First Software Lifecycle OS](epic.md)  
**Status:** Done  
**Points:** 8  

---

## 1. Overview & Problem Statement

Modern software architectures are distributed across microservices, event streams, serverless functions, and distributed databases. Engineers and AI agents require an accurate, real-time topological map of systems to understand blast radiuses, downstream consumers, and infrastructure boundaries before modifying code.

Story 31.02 delivers the **Topology & Catalog Manager** desktop application for RobOS (`packages/topology-manager`). It visualizes and edits system topologies using the **C4 Model** and **Backstage Software Catalog** standards, rendering high-performance graph visualizations with **Cytoscape.js**.

### Core Capabilities
- **Multi-Level C4 Architecture Views**: Toggle seamlessly between L1 System Context, L2 Containers, L3 Components, and Live OTel Telemetry.
- **Spotify Backstage Ingestion**: Ingests Backstage `catalog-info.yaml` entity descriptors into `.robos/topology.yaml`.
- **Structurizr / PlantUML C4 Exporter**: 1-click generation of C4 architectural diagram markup.
- **Contract & Devcontainer Badging**: Displays linked OpenAPI contracts and container runtimes (`.devcontainer/devcontainer.json`).
- **Blast Radius Analysis**: Automatically calculates upstream callers and downstream dependencies.

---

## 2. Acceptance Criteria

- [x] Interactive topology canvas renders systems, microservices, databases, and message brokers with C4 communication links.
- [x] Multi-level C4 zoom switcher switches between System Context (L1), Containers (L2), Components (L3), and Live OTel metrics.
- [x] Ingesting Backstage `catalog-info.yaml` dynamically adds entity nodes to the topology graph.
- [x] 1-click C4 export generates valid Structurizr and PlantUML C4 markup.
- [x] Verified with unit and automated E2E tests (`packages/robos-test/tests/sdlc-graph/topology-manager.test.js`) and persistent walkthrough archive in `~/.robos/development/walkthroughs/topology-manager/`.
