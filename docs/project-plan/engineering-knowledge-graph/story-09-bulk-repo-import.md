# Story 08-09: Bulk Git Repository Import & Multi-App Archetype Modeling

**Epic:** [EKGraph](epic.md)  
**Status:** **Done**

## Overview
Allows bulk-importing a list of Git / GitHub repository URLs (or local workspaces from `git-projects.json`) into the RobOS Knowledge Graph (`robos-graph`). The engine automatically classifies repositories into first-class application archetypes (**Microservices**, **Desktop Apps**, **Console / CLI Apps**, **Mobile Apps**, **Data Pipelines**, and **Libraries**), generates complete architectural models (such as OpenAPI 3.1 YAML contracts with paths and schemas, Protobuf gRPC definitions, and CLI command specs), validates them via W3C SHACL constraint shapes, automatically persists them to declarative GitOps catalogs (`.robos/packages.yaml`), and triggers automated living documentation update prompts.

Repositories added in RobOS Git Projects are continuously synchronized with the Knowledge Graph and automatically updated upon `git pull` on the `main` branch.

## Acceptance Criteria
- [x] Multi-App archetypes supported: `robos:DesktopApp`, `robos:ConsoleApp`, `robos:MobileApp`, `robos:DataPipeline`, `robos:Library`, and `robos:Microservice`.
- [x] W3C SHACL constraint shapes defined: `DesktopAppShape`, `ConsoleAppShape`, `MobileAppShape`, `DataPipelineShape`, and `LibraryShape`.
- [x] `BulkRepoImporter` analyzes lists of GitHub/Git URLs, detects tech stacks (Java Spring Boot, Go Gin/gRPC, Electron, React Native, Python Celery, etc.), and generates full models.
- [x] OpenAPI 3.1 YAML specifications generated automatically with operational paths, parameters, and schemas for API services.
- [x] "Bulk Import Repos" header button and interactive modal added to Knowledge Graph Explorer UI.
- [x] Category filter pills and rich visual inspector cards for Desktop Apps (window config, framework), Console Apps (subcommands table, flags), and Contracts (embedded OpenAPI YAML).
- [x] Integration with `packages/git-projects`: auto-sync on project save and on `git pull` on `main`.
- [x] Continuous living documentation synchronization prompt generated upon bulk import.
- [x] Comprehensive automated and GUI E2E test suite in `packages/robos-test/tests/sdlc-graph/bulk-repo-import.test.js`.
