---
title: RobOS Interactive eLearning Hub Architecture
layout: default
parent: System Architecture
nav_order: 3
---

# RobOS Interactive eLearning Hub — Architecture Specification

> **Knowledge Graph Entity**: `urn:robos:app:robos-elearning`  
> **Type**: `robos:DesktopApp, oslc:Resource`  
> **Owner Team**: `Developer Experience Guild`  
> **Repository**: `github.com/robos-inc/robos`  
> **Technology Stack**: `Electron / Vanilla JS / Web Audio`  
> **Last Synchronized**: 2026-09-25T12:00:00.000Z

---

## 1. Executive Architecture Overview

**RobOS eLearning** is the native interactive course player, lab runner, and completion credential hub. It renders rich curricula defined as `robos:ELearning` graph nodes, walks developers through verified hands-on labs, runs knowledge checks, and issues cryptographically verified `robos:CertificateOfCompletion` credentials registered in the Knowledge Graph.

---

## 2. Component Topology & Data Flow

```mermaid
graph TD
    Learner[Developer / Engineer] -->|Interactive Labs| Player[RobOS eLearning Player]
    Player -->|IPC Bridge| Main[Electron Main Process]
    Main -->|Query Courses| Graph[SDLC Knowledge Graph Store]
    Player -->|100% Score| Cert[Issue Certificate of Completion]
    Cert -->|W3C SHACL| Store[Register Credential in KGraph]
```

---

## 3. Specifications, Contracts & Interfaces

- **Target Component URI**: `urn:robos:app:robos-elearning`
- **Owner Team**: `Developer Experience Guild`
- **Source Package**: `packages/robos-elearning`
- **Debug Port**: `19185`
- **GitOps Catalog**: `.robos/elearning.yaml`

---

## 4. UX Audit & Creation Studio Specification

For the comprehensive usability audit, Course Creation Studio workflows, hierarchical folder trees, and drag-and-drop interaction models, see the **[eLearning Creation & Organization UX Audit]({{ site.baseurl }}/ideas/specs/robos-elearning-creation-and-organization-ux-audit.html)**.
