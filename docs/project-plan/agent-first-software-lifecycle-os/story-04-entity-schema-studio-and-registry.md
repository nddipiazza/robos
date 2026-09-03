# Story 31.04: Entity Schema Studio & Registry (TypeSpec / JSON Schema / Buf)

**Epic:** [RobOS — Agent-First Software Lifecycle OS](epic.md)  
**Status:** Done  
**Points:** 8  

---

## 1. Overview & Problem Statement

In generative software development, data schemas are the single source of truth for code generation. When schemas are well-defined, AI agents can effortlessly generate database migrations, backend ORMs, frontend interfaces, mock data generators, and serialization layers without hallucination.

Story 31.04 delivers the **Entity Schema Studio & Registry** (`packages/schema-studio`), a multi-language visual and code editor for defining domain models using **TypeSpec**, **JSON Schema**, and **Protocol Buffers**.

### Core Capabilities
- **Multi-Format Schema Modeling**: Standardizes domain models on Microsoft TypeSpec (`.tsp`), Google/Buf Protobuf (`.proto`), and JSON Schema 2020-12.
- **Cross-Language Code Generation Engine**: Compiles TypeSpec models directly into TypeScript (Zod/interfaces), Java 21 (Jackson Records), Python (Pydantic v2), Go 1.22 (Structs), and Prisma ORM schemas.
- **Automated Breaking Change & Drift Detection**: Buf Breaking and TypeSpec drift audit engine flags removed or altered fields before Git commits.
- **Synthetic Mock Dataset Generation**: Auto-generates realistic synthetic test fixtures matching domain models.
- **GitOps Persistence**: Saves entity specifications directly to `.robos/entities/`.

---

## 2. Acceptance Criteria

- [x] Developers and AI agents can create, view, and inspect `.typespec`, `.proto`, and JSON Schema files with live syntax validation.
- [x] One-click compilation cross-compiles models to TypeScript, Java, Python, Go, and Prisma schemas.
- [x] Breaking change detector audits and flags backward-incompatible field drift.
- [x] Synthetic mock data generator generates valid offline test JSON matching schemas.
- [x] Verified with unit and automated E2E tests (`packages/robos-test/tests/sdlc-graph/schema-studio.test.js`) and persistent walkthrough archive in `~/.robos/development/walkthroughs/schema-studio/`.
