# Feature Spec: Unified RobOS Setup Assistant & AI Project Provisioner

- **Status**: Draft
- **Created Date**: 2026-08-26
- **Target Component**: Desktop OS / Security Setup / Desktop Manager / Agents Manager / Task Manager
- **Author/Idea Source**: User Idea

## 1. Overview & Vision
When booting RobOS for the first time, developers are currently presented with piecemeal, staggered credential popups (such as `security-setup` for GPG initialization and `git-login-manager` for missing GitHub credentials) alongside immediate system notification toasts. This piecemeal approach creates context-switching friction before the system is ready.

This feature introduces a **Unified Setup Assistant (`robos-onboarding`)**. The setup assistant gathers all security keys, VCS credentials, and favorite AI agent configurations upfront in a single, guided flow. While the setup assistant is active, background missing-credential popups and notification toasts are suppressed. Upon completion, a background RobOS AI agent uses automated workspace skills to configure developer environments and projects end-to-end.

## 2. User Stories & Use Cases
- **As a** new RobOS developer,
- **I want to** configure my GPG keys, GitHub account, and preferred AI agents (Copilot CLI, Claude Code, Gemini) in a single onboarding flow on first login,
- **So that** I don't get interrupted by annoying popups and can immediately have RobOS AI agents provision my workspace using skills.

- **As a** lead developer,
- **I want** the RobOS AI agent to run setup skills automatically right after onboarding,
- **So that** project repositories are checked out, runtimes installed, and IDE run configurations injected without manual setup steps.

## 3. Key Capabilities & Scope

- [ ] **Onboarding Suppression Guard**: `desktop-manager` and `git-login-manager` check `~/.config/robos/onboarding-completed.json`. Piecemeal missing-credential dialogs and warning toasts are suppressed until onboarding completes.
- [ ] **Unified Multi-Step Setup Interface**: A modern Electron app (`robos-onboarding`) guiding the user through:
  1. *Security & Password Store*: GPG keypair generation and pass store initialization.
  2. *VCS & GitHub Setup*: GitHub OAuth / Personal Access Token authentication, SSH key generation, and automatic upload to GitHub via GitHub API.
  3. *AI Agent Integrations*: API keys & CLI authorizations for Copilot CLI, Claude Code, Gemini CLI, and Anthropic/OpenAI API keys.
- [ ] **RobOS Agent Plugins Ecosystem & Auto-Install**:
  - Maintain public GitHub repositories for RobOS plugins: `nddipiazza/robos-claude-plugin`, `nddipiazza/robos-codex-plugin`, `nddipiazza/robos-copilot-plugin`, and `nddipiazza/robos-gemini-plugin`.
  - RobOS dev apps automatically pull and install/update the latest plugin for the configured AI agents during setup and launch.
- [ ] **Synchronized Multi-Repo Skill Builder**:
  - Each plugin includes a meta-skill (`/add-robos-skill` / `sync-skills`) capable of creating and updating RobOS skills.
  - The skill synchronizer is multi-repo aware and automatically propagates skill additions and updates across all 4 plugin repositories (`robos-claude-plugin`, `robos-codex-plugin`, `robos-copilot-plugin`, `robos-gemini-plugin`) simultaneously in sync.
- [ ] **RobOS Agent Project Provisioning**: Upon setup completion, `robos-onboarding` triggers a dedicated RobOS Agent execution using `/dev-setup` and project skills to automatically inspect the target workspace, clone repositories, install language dependencies, and inject IDE run configurations.

### Out of Scope
- Rewriting existing GPG encryption backends (the onboarding flow wraps `pass` and GPG CLI).
- Non-Git version control systems (focus on Git / GitHub / GitLab).

## 4. Architectural & System Integration

- **Impacted Packages/Apps**:
  - `packages/security-setup` (expanded or integrated into `robos-onboarding`)
  - `packages/desktop-manager` (watchdog checks onboarding state before launching prompt windows)
  - `packages/git-login-manager` (defers prompt until onboarding completion flag is present)
  - `packages/agents-manager` (receives configured agent credentials & models)
- **IPC / Endpoints Required**:
  - `ipcMain.handle('get-onboarding-status')`
  - `ipcMain.handle('complete-onboarding')`
  - `ipcMain.handle('test-agent-connection', { agentId, apiKey })`
  - `ipcMain.handle('trigger-agent-project-setup', { workspacePath })`
- **UI/UX Considerations**:
  - Step-by-step wizard wizard layout with step progress indicators.
  - Interactive validation status for credentials (green checkmarks upon valid SSH/API key verification).
- **Data & Configuration Storage**:
  - Onboarding state: `~/.config/robos/onboarding-completed.json`
  - Encrypted credentials stored via `pass` in GPG password store (`~/.password-store/robos/`).

## 5. Proposed Implementation Plan

1. **Phase 1: Onboarding State Manager & Popup Suppression**
   - Create `~/.config/robos/onboarding-completed.json` state schema in `robos-lib`.
   - Update `desktop-manager` and `git-login-manager` to respect the completion flag before raising credential prompts.

2. **Phase 2: Unified Onboarding Interface (`robos-onboarding`)**
   - Build step-by-step UI: Security -> Git Auth -> AI Agents -> Summary.
   - Implement live verification endpoints for GitHub SSH/OAuth and AI model keys.

3. **Phase 3: AI Agent Skill Provisioning Integration**
   - Wire post-onboarding completion callback to trigger `agents-manager` / Copilot / Claude setup skills.
   - Execute workspace dev-setup generation automatically.

## 6. Acceptance Criteria

- [ ] First boot of RobOS displays `robos-onboarding` instead of separate GPG / Git credential popups.
- [ ] Warning toasts and missing-credential dialogs are suppressed while `robos-onboarding` is active.
- [ ] User can connect GitHub credentials, GPG pass store, and AI agent keys (Copilot, Claude, Gemini) in one flow.
- [ ] Completing the setup marks `onboarding-completed.json` as `true` and launches the RobOS agent project setup skill.
