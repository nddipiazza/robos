# Story 32.07: Automated E2E-Driven Development (EDD) Agent Runner

**Epic:** [Dual-State SDLC Knowledge Graph & E2E-Driven Verification Engine](epic.md)  
**Status:** Done  
**Points:** 13  

---

## 1. Overview & Problem Statement

In an AI-first workflow, prompt-and-pray coding fails on complex systems. The most robust methodology for autonomous agents is **End-to-End Driven Development (EDD)**: the agent starts by writing an executable E2E test reflecting the user's Gherkin scenario, verifies that it fails for the expected reason (Red), implements the necessary code across backend and frontend (Green), and refactors cleanly while ensuring no regressions occur (Refactor).

Story 32.07 builds the **Autonomous EDD Agent Runner** (`packages/robos-agent-session/lib/edd-runner.js`), executing structured TDD/EDD development loops inside the self-contained test fabric.

### Core Capabilities
- **Strict Red-Green-Refactor Guard**: Agent must verify that tests fail meaningfully prior to applying code modifications.
- **Multi-Phase State Machine**: `INGESTION` ➔ `RED_VERIFICATION` ➔ `IMPLEMENTATION` ➔ `GREEN_VERIFICATION` ➔ `REGRESSION_CHECK` ➔ `COMPLETED`.
- **Integrated Diagnostic Stream**: Real-time diagnostic console and regression verification across all 11 test suites.

---

## 2. Acceptance Criteria

- [x] Agent autonomously completes Red -> Green -> Refactor cycle without human intervention for standard features.
- [x] Runner verifies that tests fail meaningfully prior to code implementation.
- [x] Full regression suite is executed prior to declaring a task ready for human review.
- [x] Real-time execution logs and state stepper are rendered in the SDLC Knowledge Graph Explorer.
- [x] Verified with unit and automated E2E tests (`packages/robos-test/tests/sdlc-graph/edd-runner.test.js`) and persistent walkthrough archive in `~/.robos/development/walkthroughs/edd-runner/`.
