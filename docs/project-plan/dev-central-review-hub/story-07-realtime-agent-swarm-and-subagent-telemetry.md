---
nav_exclude: true
---

# Story 29.07: Real-Time Agent Swarm & Subagent Telemetry

**Epic:** Dev Central — AI Agent Review-Based Development Hub
**Points:** 8
**Status:** Not started

## Description
Build real-time monitoring of running agent swarms and subagents across all projects, showing tool execution streams, token usage, subagent hierarchies, and one-click session jumping into IDE workspaces or desktop agent sessions.

## Tasks
- [ ] Build Agent Swarm Visualizer rendering the parent-subagent hierarchy tree.
- [ ] Implement live tool call activity feed (`grep_search`, `replace_file_content`, `run_command`, etc.).
- [ ] Display real-time token counts, execution durations, and lifecycle states (`running`, `waiting_for_input`, `idle`).
- [ ] Add session jump actions: "Open in RobOS IDE" (via port 63343) and "Watch Desktop Stream" (via `desktop-agents`).
