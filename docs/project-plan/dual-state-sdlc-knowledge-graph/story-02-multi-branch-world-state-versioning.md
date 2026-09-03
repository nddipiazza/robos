# Story 32.02: Multi-Branch World State Versioning (`main` vs `feature/poc/pilot`)

**Epic:** [Dual-State SDLC Knowledge Graph & E2E-Driven Verification Engine](epic.md)  
**Status:** Done  
**Points:** 8  

---

## 1. Overview & Problem Statement

Engineering organizations constantly juggle multiple realities:
1. **Production Reality (`main`)**: What is deployed and running right now.
2. **Proposed Future Realities**: Planned features, architectural spikes, experimental Proof of Concepts (POCs), and pilot programs.

Traditional tools only track code branches, leaving the architecture, contracts, and requirement graphs disconnected. Story 32.02 implements **Git-Backed Dual-State Multi-Branch World State Versioning**, giving first-class status to `main` (Prod) alongside `feature/*`, `poc/*`, `pilot/*`, and `spike/*` branches.

---

## 2. Acceptance Criteria

- [x] Users can switch between `main` (Production) and child branches in <50ms.
- [x] First-class badges identify `production`, `feature`, `poc`, and `pilot` branch states.
- [x] Child branches inherit baseline knowledge graph from `main` and track delta mutations.
- [x] AI agents can query both current production state and proposed future state in a single session.
- [x] Verified with unit and automated E2E tests (`packages/robos-test/tests/sdlc-graph/branch-manager.test.js`) and persistent walkthrough archive in `~/.robos/development/walkthroughs/branch-manager/`.
