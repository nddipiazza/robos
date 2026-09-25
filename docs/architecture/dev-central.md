---
title: Dev Central Command Center Architecture
layout: default
parent: System Architecture
nav_order: 4
---

# Dev Central Command Center — Architecture Specification

> **Knowledge Graph Entity**: `urn:robos:app:dev-central`  
> **Type**: `robos:DesktopApp, oslc:Resource`  
> **Owner Team**: `Developer Experience Guild`  
> **Repository**: `github.com/robos-inc/robos`  
> **Technology Stack**: `Electron / Vanilla JS / Monaco Editor`  
> **Last Synchronized**: 2026-09-25T12:00:00.000Z

---

## 1. Executive Architecture Overview

**Dev Central** is the daily developer mission control in RobOS. It aggregates sprint boards, GitHub pull requests, real-time CI status, system notifications, and blocker radar into a unified high-productivity developer dashboard.

---

## 2. Component Topology & Data Flow

```mermaid
graph TD
    Dev[Software Engineer] --> DevCentral[Dev Central Desktop App]
    DevCentral -->|Sync PRs| GitHub[GitHub API / Gitea]
    DevCentral -->|Track CI| CIMonitor[CI Monitor MCP]
    DevCentral -->|Scan Blockers| BlockerRadar[Blocker Radar Engine]
    DevCentral -->|Standup Summary| AIAgent[RobOS Standup AI]
```

---

## 3. Specifications, Contracts & Interfaces

- **Target Component URI**: `urn:robos:app:dev-central`
- **Owner Team**: `Developer Experience Guild`
- **Source Package**: `packages/dev-central`
- **Debug Port**: `19101`
