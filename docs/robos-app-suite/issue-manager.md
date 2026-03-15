---
layout: default
title: Issue Manager
parent: RobOS App Suite
nav_order: 3
---

# Issue Manager

> GitHub Issues browser with swim-lane board, AI-powered breakdown, and sprint planning.

---

## Overview

Issue Manager provides a full GitHub Issues experience without leaving the desktop. Issues are displayed in a configurable Kanban swim-lane board. The AI can break a large issue into sub-tasks, estimate effort, and draft an implementation plan — all surfaced inline.

---

## Features

- Swim-lane Kanban board driven by GitHub issue labels or milestones
- List view with full-text search and label/assignee filters
- AI issue breakdown — generates sub-task checklist with acceptance criteria
- Create, edit, and close issues without leaving the app
- Links to the corresponding [Git Projects](git-projects) workspace
- Real-time label and milestone management

---

## How to Open

```bash
/usr/local/share/robos/issue-manager/launch.sh
```

---

## Usage

### Browsing issues

Select a repository from the top-right dropdown. Issues load grouped into columns by label or milestone depending on your board config.

### AI breakdown

Open any issue and click **✨ Break Down**. The AI analyses the issue title and body then inserts a task checklist as a comment draft. Review and post with one click.

### Creating an issue

Click **+ New Issue**, fill in title/body/labels, and press **Submit**. The issue is created via the GitHub API and immediately appears on the board.

---

## Configuration

| Setting key | Description |
|-------------|-------------|
| `github_token` | GitHub personal access token (needs `repo` scope) |
| `github_org` | Default org/user for repository list |

---

## IPC Reference

| Channel | Direction | Description |
|---------|-----------|-------------|
| `get-issues` | Renderer → Main | Returns issues for a repo with optional filters |
| `create-issue` | Renderer → Main | Creates a new GitHub issue |
| `update-issue` | Renderer → Main | Edits title, body, labels, or state |
| `get-labels` | Renderer → Main | Returns all labels for a repo |
| `ai-breakdown` | Renderer → Main | Streams AI sub-task breakdown for an issue |

---

## Data & Files

| Path | Description |
|------|-------------|
| `~/.config/robos/settings.json` | GitHub token and org |
