# Story 05-01: Workspace Provisioning from Task

**Epic:** [Workspace Management](epic.md)
**Status:** Not started
**Points:** 8

## Description

When a developer picks up a task, Workspace Manager auto-provisions: clones the correct repo, creates/checks out the feature branch (naming convention from config), runs npm/pip/gradle install, starts dev servers per project config. Workspace is linked to the task and tracked in distributed config.

## Acceptance Criteria

- [ ] Tested with buildbarn-forms example project
- [ ] Works with both JetBrains IDEs and VS Code
- [ ] Errors handled gracefully with user-visible messages
