---
nav_exclude: true
---

# Story: Taskbar Dock & Toolbar Agent Management Widget

**Epic:** [Ephemeral Agent User Profiles with Direct Host Display Bridging](epic.md)  
**Status:** Done  
**Points:** 8  

## Description

Design and implement a RobOS taskbar / panel toolbar widget in `packages/robos-desktop` that provides live observability and control over all active ephemeral agent accounts. Shows active agent counts (e.g. `[ 🤖 2 Agents ]`), lists associated open windows and processes, visualizes memory and CPU usage per agent, and provides quick-action buttons to launch new ephemeral apps or terminate sessions immediately.

## Acceptance Criteria

- [x] Taskbar panel displays an active agent counter and status indicator icon (`[ 🤖 2 Agents ]`)
- [x] Clicking the widget opens a dropdown list of all running ephemeral agent sessions with process counts and memory usage
- [x] Visual indicators and badges allow the user to identify which agent account owns each running window
- [x] Each profile entry has a "Kill & Wipe" button to immediately terminate processes and remove the ephemeral account
- [x] A "Clean All" button purges all running ephemeral sessions at once
- [x] Verified with unit and automated E2E tests (`packages/robos-test/tests/robos-profiled/taskbar-widget.test.js`) and persistent walkthrough archive in `~/.robos/development/walkthroughs/robos-profiled-taskbar/`.
