# Story 31.03: Human & Agent Personnel Roster (Team Topologies & MCP)

**Epic:** [RobOS — Agent-First Software Lifecycle OS](epic.md)  
**Status:** Done  
**Points:** 8  

---

## 1. Overview & Problem Statement

In an Agent-First engineering ecosystem, AI agents are not generic chatbots—they are specialized members of engineering teams with defined responsibilities, assigned toolsets (Model Context Protocol / MCP servers), model configurations, and human pair partners.

Story 31.03 introduces the **Human & Agent Personnel Manager** (`packages/people-manager`), organizing human engineers and AI agents according to the industry-standard **Team Topologies** model (Stream-Aligned, Platform, Enabling, Complicated-Subsystem).

### Core Capabilities
- **Team Topologies Classification**: Structures teams into Stream-Aligned, Platform, Enabling, and Complicated-Subsystem archetypes with defined interaction modes (X-as-a-Service, Collaboration, Facilitating).
- **Human-in-the-Loop Pair Architecture**: Pairs autonomous AI agent swarms with human Lead Architects for plan review and code approval.
- **AI Agent Persona Configuration**: Configures model selections (`claude-3.7-sonnet`, `gemini-2.5-pro`, `gpt-4o`) and execution permissions.
- **Model Context Protocol (MCP) Skill Matrices**: Binds MCP servers (`chrome-devtools`, `git-repo-tools`, `system-services`, `test-fabric`) and RobOS skills (`e2e-driven-dev`, `contract-drift-detector`, `create-feature-spec`) directly to agent personas.
- **Declarative GitOps Persistence**: Synchronizes all team structures and personas directly to `.robos/teams.yaml`.

---

## 2. Acceptance Criteria

- [x] Users can create, view, and manage teams categorized by Team Topologies types.
- [x] Human engineers are explicitly designated as Lead Architects and Code Reviewers.
- [x] AI agent personas configure explicit models, system prompts, and RobOS skills.
- [x] Granular Model Context Protocol (MCP) server bindings are displayed and editable per persona.
- [x] Verified with unit and automated E2E tests (`packages/robos-test/tests/sdlc-graph/people-manager.test.js`) and persistent walkthrough archive in `~/.robos/development/walkthroughs/people-manager/`.
