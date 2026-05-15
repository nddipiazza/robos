---
nav_exclude: true
---

# Story 06-02: Claude Code Integration

**Epic:** [AI Agent Integration](epic.md)
**Status:** Not started
**Points:** 5

## Description

Integrate Claude Code (claude CLI) as a first-class agent backend. Start Claude Code sessions in workspace directories with task context injected. Stream Claude's output to the agent session UI. Support Claude's tool use (file edits, bash commands, etc.). Map Claude's actions to task workflow stage progress.

## Acceptance Criteria

- [ ] Tested end-to-end with buildbarn-forms example task
- [ ] Agent actions visible in real-time in the UI
- [ ] Task workflow stage advances correctly
