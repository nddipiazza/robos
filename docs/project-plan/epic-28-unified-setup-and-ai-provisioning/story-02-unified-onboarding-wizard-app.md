---
nav_exclude: true
---

# Story 28.02: Unified Onboarding Wizard App (`packages/robos-onboarding`)

**Epic:** Epic 28 (Unified Setup Assistant & AI Project Provisioner)
**Points:** 8
**Status:** Not started

## Description
Build the Electron-based `robos-onboarding` application providing a step-by-step setup wizard that guides the developer through GPG master key creation, GitHub account authentication (OAuth / PAT / SSH key auto-upload), and AI Agent configuration.

## Tasks
- [ ] Create `packages/robos-onboarding` app with step-by-step UI layout.
- [ ] Implement Step 1 (Security): GPG key generation & password store (`pass`) initialization.
- [ ] Implement Step 2 (VCS & GitHub): GitHub authentication, SSH keypair creation, and automatic GitHub public key deployment.
- [ ] Implement Step 3 (AI Agents): Configuration form for Copilot CLI, Claude Code, Gemini CLI, Anthropic, and OpenAI keys.
- [ ] Implement Step 4 (Completion): Mark `onboarding-completed.json` as `true` and trigger background agent project setup.
