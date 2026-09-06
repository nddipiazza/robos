---
nav_exclude: true
---

# Story: Deep Codebase Inspection & Heuristic Archetype Detector

**Epic:** Existing App Import Wizard
**Points:** 8
**Status:** In Progress

## Description
Analyze build manifests (package.json, pom.xml, go.mod, Cargo.toml, etc.) and automatically infer the archetype, framework, and language version.

## Tasks
- [x] Scan build manifests (package.json, pom.xml, build.gradle, go.mod, Cargo.toml, pyproject.toml).
- [x] Implement heuristic detection rule engine identifying archetype (Microservice, Desktop, CLI, etc.).
- [x] Extract runtime dependencies, language version, and build scripts.
- [x] Display inspection results card with confidence score and detected traits.
- [x] Allow developer to override detected archetype if necessary.
