---
title: RobOS Projects
layout: default
nav_order: 6
has_children: true
permalink: /projects/
---

# RobOS Projects: Real-World Applications & Systems
{: .no_toc }

Explore production-grade applications, games, and distributed systems architected, scaffolded, and governed autonomously by RobOS and its AI agents.
{: .fs-6 .fw-300 }

## Table of contents
{: .no_toc .text-delta }

1. TOC
{:toc}

---

## Overview

In traditional software development, autonomous AI coding assistants often produce fragile, disconnected prototypes that break outside simple sandbox scripts. **RobOS transforms AI agents from isolated script writers into Lead System Engineers** governed by formal Knowledge Graph schemas, strict architectural boundaries, and verifiable video proof-of-work.

The **RobOS Projects** portfolio showcases complex, multi-subsystem applications built from scratch using the RobOS AI-First SDLC Platform:
- Polyglot backend microservices and distributed REAPI v2 build clusters.
- Developer tools, database managers, and IDE review bridges.
- **Rich interactive 2D/3D games** featuring Real-Time with Pause (RTwP) combat, collision pathfinding, and autonomous AI playthrough harnesses.

---

## Featured Flagship Project

### Tactical cRPG & Infinity AI Engine

| **Project Name** | **Tactical cRPG Realm (`crpg-realm`)** |
| **Engine / Profile** | Godot 4.3 (GL Compatibility) |
| **Language & Stack** | GDScript (typed), Python 3.12+ (`behave`), FFmpeg |
| **Ontology & Standard** | Schema.org `schema:VideoGame`, RobOS `robos:PCGame`, D&D 5e SRD |
| **Testing Harness** | Dual E2E Suite: 11 Isolated Features + 6 Start-to-Finish Playthrough Scenarios |
| **Verification Score** | **17 Features, 28 Scenarios, 482 Steps (100% Passed)** |

```mermaid
graph LR
    subgraph "Knowledge Graph & Schemas"
        KG["crpg_game_v1.schema.json"] --> DS["data/v1/ (Classes, Spells, Monsters, NPCs)"]
        DS --> GD["src/generated/v1/DataStoreV1.gd"]
    end

    subgraph "Godot 4.3 Runtime Engine"
        GD --> World["5-Act Epic Campaign Scenes"]
        World --> RTwP["RTwP Combat & Round Timer (6.0s)"]
        World --> Phys["StaticBody2D Colliders & Pathfinder.gd"]
        World --> ActLog["3-Mode Infinity Engine Activity Log"]
    end

    subgraph "Autonomous QA & Verification"
        HTTP["GameControlServer (HTTP :18090)"] <--> AI["Infinity AI Agent (qa_player)"]
        AI --> BDD["Cucumber BDD Scenarios (17 Features)"]
        BDD --> Video["1080p Video Proof-of-Work (FFmpeg + Xvfb)"]
    end

    World <--> HTTP
```

---

## Project Directory

<div class="card-grid" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 1.5rem; margin-top: 1.5rem;">
  <div class="card" style="border: 1px solid #30363d; border-radius: 8px; padding: 1.5rem; background: #0d1117;">
    <h3 style="margin-top: 0; color: #58a6ff;"><a href="{{ '/projects/crpg-realm/' | relative_url }}">⚔️ Tactical cRPG & Infinity AI Engine</a></h3>
    <p style="color: #8b949e; font-size: 0.95rem;">A party-based tactical isometric cRPG built in Godot 4 inspired by classic Infinity Engine masterpieces (Baldur's Gate, Icewind Dale). Features D&D 5e SRD rules, 5-Act Epic Campaign, physical building collision, 18 unique NPCs with branching dialogue, and autonomous AI questing.</p>
    <div style="margin-top: 1rem;">
      <a href="{{ '/projects/crpg-realm/' | relative_url }}" class="btn btn-primary fs-3">Explore Project</a>
      <a href="{{ '/projects/crpg-realm/game-creation-process.html' | relative_url }}" class="btn fs-3" style="margin-left: 0.5rem;">Architecture</a>
    </div>
  </div>
</div>

---

## What Makes a RobOS Project Different?

1. **Dual-State Knowledge Graph First**: Every entity (classes, spells, monsters, NPCs, items, maps) is modeled as typed JSON-LD backed by W3C SHACL shape constraints. Changes trigger semantic blast-radius analysis before any code is committed.
2. **Autonomous End-to-End Verification**: Rather than relying on fragile unit assertions or mocked unit tests, RobOS projects are verified in virtual framebuffers (Xvfb) via real user-simulation agents producing 1080p video walkthroughs.
3. **Clean Code Generation**: Engine data stores and data models are auto-generated from JSON Schemas, eliminating hardcoded constants and runtime type errors.
4. **Agent-Agnostic Governance**: The project structure allows Claude Code, Google Antigravity, GitHub Copilot, and OpenAI Codex to collaborate on the exact same codebase without configuration drift.
