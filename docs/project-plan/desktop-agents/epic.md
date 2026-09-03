---
nav_exclude: true
---

# RobOS Desktop Agents & Multi-User Session Tunneling

**Status:** Done
**Priority:** High
**Dependencies:** Desktop Foundation, App Framework, AI Agent Integration, Security & Auth

Full-fledged Linux sub-agent user sessions (`agent-<task-id>`) running on isolated virtual displays (Xvfb / Wayland), complete with host credential tunneling, live streaming desktop viewer app, pinned workflow sidebar, and interactive "Proof of Work" human verification.

## Stories

| # | Story | Status | Points |
|---|-------|--------|--------|
| 01 | [Sub-Agent Linux Daemon (robos-agentd)](story-01-agentd-system-daemon.md) | **Done** | 8 |
| 02 | [Host Credential & Socket Tunneling](story-02-host-session-tunneling.md) | **Done** | 5 |
| 03 | [Virtual Display Stream Engine](story-03-virtual-display-engine.md) | **Done** | 8 |
| 04 | [Pinned Agent Sidebar App (agent-sidebar)](story-04-pinned-agent-sidebar-app.md) | **Done** | 5 |
| 05 | [Desktop Agents Viewer App (desktop-agents)](story-05-desktop-agents-viewer-app.md) | **Done** | 5 |
| 06 | [Agent Session Shared Library (robos-agent-session)](story-06-robos-agent-session-library.md) | **Done** | 5 |
| 07 | [Proof of Work Interactive Verification Flow](story-07-proof-of-work-verification-flow.md) | **Done** | 5 |
