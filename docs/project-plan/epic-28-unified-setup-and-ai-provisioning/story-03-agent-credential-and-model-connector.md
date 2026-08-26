---
nav_exclude: true
---

# Story 28.03: AI Agent Credential & Model Connector

**Epic:** Epic 28 (Unified Setup Assistant & AI Project Provisioner)
**Points:** 5
**Status:** Not started

## Description
Provide credential storage and live connection validation for favorite AI agent platforms (Copilot CLI, Claude Code, Gemini CLI, Anthropic, OpenAI) integrated with `pass` password store and `agents-manager`.

## Tasks
- [ ] Implement secure secret storage endpoints in `pass` (`pass insert robos/ai/agent-id`).
- [ ] Build live connection test handlers (`test-agent-connection`) for Copilot, Claude, and Gemini CLI tools.
- [ ] Connect default AI model selection preferences to `~/.config/robos/preferences.json`.
- [ ] Inject active credentials seamlessly into `packages/agents-manager`.
