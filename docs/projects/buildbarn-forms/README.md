# Project: buildbarn-forms & buildbarn-forms-proto

**Project Name:** `buildbarn-forms`
**Owner:** Hermetiq
**Repositories:**
- [`Hermetiq/buildbarn-forms`](https://github.com/Hermetiq/buildbarn-forms) — React component library
- [`Hermetiq/buildbarn-forms-proto`](https://github.com/Hermetiq/buildbarn-forms-proto) — Generated protobuf types

**npm Packages:**
- `@hermetiq/buildbarn-forms` (GitHub Packages)
- `@hermetiq/buildbarn-forms-proto` (GitHub Packages)

---

## Problem Statement

[Buildbarn](https://github.com/buildbarn) is a distributed build caching and remote execution system used in large-scale Bazel builds. It is configured via **Jsonnet** files — a data templating language that compiles to JSON. These Jsonnet configs drive Kubernetes deployments via ConfigMaps.

**The challenge:** Buildbarn configuration is deeply nested and spread across dozens of proto files in multiple repositories. For operators who aren't deeply familiar with every proto message and field, this creates real friction:

- Proto documentation is scattered across repos — no single reference.
- Raw Jsonnet editing is error-prone and hard to learn.
- No validation until the config is actually applied to a running cluster.
- No templates or sensible defaults to guide new users.

**The solution:** Two reusable npm libraries that together provide a **form-driven, proto-aware Buildbarn configuration editor** that hides Jsonnet complexity behind intelligent UI components. This editor integrates into the Hermetiq MVP dashboard (`dashboard.hermetiq.io`).

---

## Solution Overview

### @hermetiq/buildbarn-forms-proto

A standalone npm package containing **generated JavaScript/TypeScript types** for all Buildbarn protobuf configuration schemas. It is generated from the `buildbarn/bb-storage` repository's proto definitions and published to GitHub Packages.

**Why separate?** The generated code is large (~1.5 MB). Keeping it in its own package improves build performance, allows independent versioning, and lets consumers selectively import only what they need.

### @hermetiq/buildbarn-forms

A **React + TypeScript component library** that provides:

1. **`JsonnetEditor`** — A Monaco-based two-panel editor: left side edits raw Jsonnet, right side shows live evaluated JSON preview. Evaluator-agnostic (any backend can power the preview).

2. **`ProtoFormBuilder`** — A dynamic form generator that takes a protobuf schema descriptor and renders a complete form UI. Supports all protobuf field types: `string`, `number`, `boolean`, `enum`, `message`, `repeated`, `oneof`, `map`.

3. **`TreeView`** — A navigational tree component. Non-leaf nodes (objects/messages) expand/collapse; leaf nodes select a form section. Designed for split-pane layout alongside `ProtoFormBuilder`.

4. **`BuildBarnConfigEditor`** — A thin wrapper around `JsonnetEditor`, serving as the primary top-level component for Buildbarn config editing sessions.

5. **Form field components** — `TextInput`, `NumberInput`, `Checkbox`, `FormField`, `Tooltip`, `InfoTooltip` — all styled to the Hermetiq dark design system.

6. **Proto comment tooltips** — Proto field/message documentation is extracted from JSDoc annotations in the generated types and displayed as hover tooltips in forms. Users see inline help from the actual proto files without leaving the editor.

---

## Architecture

See [architecture.md](architecture.md) for the full technical architecture.

---

## Project Epics

| # | Epic | Description |
|---|------|-------------|
| 01 | [buildbarn-forms-proto Package](epic-01-forms-proto-package/epic.md) | Proto generation pipeline, comment extraction, CI/CD publish |
| 02 | [buildbarn-forms Core Library](epic-02-forms-library-core/epic.md) | ProtoFormBuilder, form fields, tooltips, package structure |
| 03 | [Jsonnet Editor](epic-03-jsonnet-editor/epic.md) | Monaco editor, live preview, JSON/YAML export |
| 04 | [Tree View Navigation](epic-04-tree-view/epic.md) | Tree navigator for form sections, split-pane layout |
| 05 | [MVP Integration](epic-05-mvp-integration/epic.md) | Wire libraries into Hermetiq MVP gRPC backend |
| 06 | [Production Config Types](epic-06-production-config-types/epic.md) | Full config type coverage, templates, ConfigMap YAML export |
| 07 | [UX & Advanced Features](epic-07-ux-advanced-features/epic.md) | Drag-and-drop, version history, visual diff, rollback |

---

## Key Decisions Made

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Integration strategy | npm library, not direct copy | Type safety, independent versioning, clean separation |
| TypeScript vs JavaScript | TypeScript for libraries | Type safety with protobufs; compiles to JS for MVP (JavaScript) |
| State management | `react-hook-form` + Immer | Efficient nested-state updates with immutability |
| Monaco editor | `@monaco-editor/react` | Full IDE-quality editing for Jsonnet |
| Proto generation | `ts-proto` + `protoc` | Preserves comments as JSDoc, generates TypeScript |
| Proto comments | Extract to JSON at build time | Avoids parsing overhead at runtime |
| Package registry | GitHub Packages (npm) | Access-controlled; suits private Hermetiq org |
| Jsonnet evaluation | Evaluator-agnostic prop | Library has no server dependency; host supplies evaluator |

---

## Current State (as of 2026-05)

### @hermetiq/buildbarn-forms-proto
- **Version:** `0.2.4`
- Proto generation from `bb-storage` working
- Comment extraction pipeline (`extract-comments.ts`) working
- CI/CD publish to GitHub Packages working

### @hermetiq/buildbarn-forms
- **Version:** `0.2.6`
- `JsonnetEditor` / `BuildBarnConfigEditor` complete and tested
- `ProtoFormBuilder` complete (51 tests, >50% coverage)
- `TreeView` with context menu stubs complete
- `InfoTooltip` and `Tooltip` complete
- Proto comment tooltip integration complete
- Package published to GitHub Packages

### Remaining Work
- Full Hermetiq MVP integration (gRPC backend wiring)
- Worker + Scheduler + Browser config schemas
- Config templates
- ConfigMap YAML export
- Version history / visual diff viewer
- Drag-and-drop UX

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Language | TypeScript 5.x |
| UI Framework | React 18/19 |
| Form State | react-hook-form 7.x |
| Immutable State | Immer 11.x |
| Code Editor | Monaco (`@monaco-editor/react`) |
| Protobuf Runtime | `@bufbuild/protobuf` 2.x |
| Proto Compiler | `protoc` + `ts-proto` |
| Jsonnet Evaluator | `@hanazuki/node-jsonnet` (dev only) |
| YAML | `js-yaml` 4.x |
| Testing | Jest 29 + `@testing-library/react` |
| Build | TypeScript compiler (`tsc`) |
| Lint | ESLint + Prettier + Husky |
| CI/CD | GitHub Actions |
| Registry | GitHub Packages (npm) |

---

## Related Projects

- **Hermetiq MVP Dashboard** (`dashboard.hermetiq.io`) — host application where the editor lives
- **Hermetiq cloud-native** — Go backend implementing `config_service.proto` gRPC API (Tim Potter)
- **Hermetiq bb-config** — GitHub repo storing Jsonnet configs per project
- **buildbarn/bb-storage** — Source of truth for Buildbarn proto definitions
