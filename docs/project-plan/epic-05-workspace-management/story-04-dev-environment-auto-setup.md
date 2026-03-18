# Story 05-04: Dev Environment Auto-Setup

**Epic:** [Workspace Management](epic.md)
**Status:** Not started
**Points:** 5

## Description

AI reads the repo and EKGraph to determine setup steps: install dependencies, start databases (docker-compose), seed data, configure env vars, start dev server. Generates a setup script, runs it, and validates each step succeeded. If a step fails, AI diagnoses and retries. Developer sees setup progress with logs.

## Acceptance Criteria

- [ ] Tested with buildbarn-forms example project
- [ ] Works with both JetBrains IDEs and VS Code
- [ ] Errors handled gracefully with user-visible messages
