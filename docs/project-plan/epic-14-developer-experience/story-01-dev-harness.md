# Story 14-01: Dev Harness

**Epic:** [Developer Experience & Testing](epic.md)
**Status:** Not started
**Points:** 5

## Description

Test RobOS Electron apps outside the VM on the host machine. Creates a sandbox home directory with stub CLI binaries (gh, git, pass, etc.). Configurable scenarios: all-good, no-gh-auth, no-ssh-key, ssh-not-on-github, scope-missing, git-config-missing, all-broken. Usage: node packages/dev-harness/harness.js --app <app-id> --scenario <scenario>. Speeds up development iteration.

## Acceptance Criteria

- [ ] Documented usage in CLAUDE.md
- [ ] Tested with at least 2 RobOS apps
