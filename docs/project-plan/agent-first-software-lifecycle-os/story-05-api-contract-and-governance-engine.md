# Story 31.05: API Contract & Governance Engine (OpenAPI 3.1, AsyncAPI, Pact)

**Epic:** [RobOS — Agent-First Software Lifecycle OS](epic.md)  
**Status:** Done  
**Points:** 13  

---

## 1. Overview & Problem Statement

When multiple AI agents work across different microservices and frontend clients simultaneously, API contracts are the immutable guardrails preventing integration failures. Without strict contract testing, agents can produce code changes that pass isolated unit tests but fail across service boundaries.

Story 31.05 delivers the **API Contract & Governance Engine** (`packages/contract-studio`), integrating **OpenAPI 3.1**, **AsyncAPI**, and **Pact Consumer-Driven Contract Testing**.

### Core Capabilities
- **Multi-Protocol Contract Authoring**: Full visual and code support for OpenAPI 3.1 REST specs and AsyncAPI 2.6 / 3.0 event-driven streams.
- **Stoplight Spectral Style Governance**: Automated linting enforcing camelCase naming, descriptions, and standard error schemas.
- **Pact Consumer-Driven Contract Testing**: `@pact-foundation/pact` consumer suites preventing AI agents and developers from breaking downstream clients.
- **One-Click Prism Mock Servers**: Spawns instant local HTTP mock servers obeying response schemas and status codes.
- **GitOps Multi-Branch Versioning**: Branch switching and commit tracking synchronized with `.robos/contracts/`.

---

## 2. Acceptance Criteria

- [x] Developers and AI agents can inspect OpenAPI 3.1 and AsyncAPI contracts with visual operation builders and schema bindings.
- [x] Spectral linter enforces API style governance rules with zero syntax errors.
- [x] Pact consumer contract verifications execute against providers (14/14 passed) to guard integrations.
- [x] One-click Prism mock servers launch locally on port 4010 and simulate valid responses.
- [x] Verified with unit and automated E2E tests (`packages/robos-test/tests/sdlc-graph/contract-studio.test.js`) and persistent walkthrough archive in `~/.robos/development/walkthroughs/contract-studio/`.
