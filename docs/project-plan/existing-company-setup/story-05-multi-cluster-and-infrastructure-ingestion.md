---
nav_exclude: true
---

# Story: Multi-Cluster & Infrastructure Ingestion

**Epic:** Existing Company Setup in RobOS
**Points:** 5
**Status:** In Progress

## Description
Ingest existing Kubernetes clusters (AWS EKS, Google Cloud GKE, Azure AKS, On-prem) and ArgoCD GitOps instances into Kube Studio, mapping live namespaces to system topology container nodes.

## Tasks
- [x] Scan and ingest ~/.kube/config contexts into Kube Studio.
- [x] Map active namespaces (Production, Staging, Dev) to Knowledge Graph topology container nodes.
- [x] Connect ArgoCD GitOps instances to display live sync status and deployment revisions.
- [x] Enable live container log streaming and pod telemetry in Kube Studio.
- [x] Provide automated topology reconciliation between live cluster resources and .robos/knowledge-graph.jsonld.
