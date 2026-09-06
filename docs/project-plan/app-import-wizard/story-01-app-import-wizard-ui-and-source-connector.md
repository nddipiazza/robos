---
nav_exclude: true
---

# Story: App Import Wizard UI & Source Connector

**Epic:** Existing App Import Wizard
**Points:** 5
**Status:** In Progress

## Description
Multi-source input modal: Local directory path picker, remote Git clone URL (GitHub, GitLab, Gitea), or monorepo subpath with shallow clone buffer.

## Tasks
- [x] Provide source selector supporting local folders, Git clone URLs, and monorepos.
- [x] Implement shallow clone or local symlink buffer for fast inspection.
- [x] Add branch and tag selector for remote repositories.
- [x] Handle authentication for private Git repositories via RobOS credentials.
- [x] Validate repository accessibility before triggering deep inspection.
