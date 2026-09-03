---
nav_exclude: true
---

# Story 26-05: "Show Me This Change in Action" Multi-Modal Presentation Protocol

**Epic:** [Dual-Context eLearning & Interactive Reviewer](epic.md)
**Status:** Not started
**Points:** 8

## Description

Implement the multi-modal **"Show Me This Change in Action"** protocol. Focuses the agent's desktop stream (`desktop-agents`) and executes a task-tailored presentation script across terminal sessions, browser tools (Chrome DevTools MCP / Playwright), desktop GUI binaries, or complex multi-app workflows before handing over interactive control to the reviewer.

## Acceptance Criteria

- [ ] Clicking "Show Me" switches focus to the agent desktop stream in `desktop-agents`.
- [ ] Agent executes the appropriate presentation modality:
  - **CLI / Terminal**: Opens terminal, runs CLI commands/tests, inspects logs.
  - **Web Apps**: Drives browser via DevTools MCP or Playwright, navigates to app routes, inspects DOM.
  - **GUI / Desktop Apps**: Spawns GUI apps/Electron tools and triggers UI interactions.
  - **Multi-App Workflows**: Coordinates terminal backend + GUI/browser frontend.
- [ ] Agent highlights modified components and displays live step progress on the sidebar.
- [ ] Hands over interactive mouse/keyboard control to the host reviewer for live testing.
