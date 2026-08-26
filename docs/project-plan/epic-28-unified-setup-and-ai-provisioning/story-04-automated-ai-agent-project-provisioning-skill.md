---
nav_exclude: true
---

# Story 28.04: Automated AI Agent Project Provisioning Skill

**Epic:** Epic 28 (Unified Setup Assistant & AI Project Provisioner)
**Points:** 8
**Status:** Not started

## Description
Develop the RobOS Agent project setup execution engine that leverages workspace setup skills right after onboarding finishes to automatically clone repositories, install language runtimes/dependencies, and inject IDE run configurations without manual developer effort.

## Tasks
- [ ] Create `/dev-setup` skill runner in `packages/agents-manager`.
- [ ] Auto-detect project repository structure (Node, Python, Java, Go, Rust).
- [ ] Automate dependency installation and environment variable population from `pass`.
- [ ] Inject `.idea/runConfigurations/` XML for IntelliJ / RobOS IDE.
- [ ] Display provisioning status in `dev-central` dashboard.
