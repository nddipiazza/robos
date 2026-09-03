# Story 32.06: Self-Contained Local Test & Dev Environment Fabric

**Epic:** [Dual-State SDLC Knowledge Graph & E2E-Driven Verification Engine](epic.md)  
**Status:** Done  
**Points:** 13  

---

## 1. Overview & Problem Statement

For AI agents to reliably write and verify code, they cannot depend on fragile remote staging environments, shared cloud clusters, or flaky external APIs. Agents need a **100% self-contained, isolated local test fabric** that spins up instantly on the developer machine with seeded test data, mocked third-party services, and headless graphical displays.

Story 32.06 implements the **Self-Contained Local Test Fabric** (`packages/robos-test/lib/test-fabric.js`), orchestrating isolated environments, local database fixture engines, WireMock/Prism stubs, and Xvfb virtual framebuffers.

### Core Directive: "Reinvent Nothing!"
- **Container Environment**: Development Containers & local test fabric orchestrators.
- **Mocking & Stubs**: Prism OpenAPI and WireMock third-party simulation (`MockStubGenerator`).
- **Headless Display**: Xvfb virtual framebuffer + Mutter / Picom compositor.
- **Database Seeding**: In-memory SQLite / Postgres snapshot and rollback engine.

---

## 2. Acceptance Criteria

- [x] Isolated test fabric launches completely offline with zero external network calls.
- [x] Spin-up time from cold start to ready state is under 3 seconds.
- [x] Database state automatically resets to baseline fixtures between test scenarios.
- [x] Electron apps and web browsers render correctly on the Xvfb virtual framebuffer without crashing.
- [x] Verified with unit and automated E2E tests (`packages/robos-test/tests/sdlc-graph/test-fabric.test.js`) and persistent walkthrough archive in `~/.robos/development/walkthroughs/test-fabric/`.
