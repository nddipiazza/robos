---
nav_exclude: true
---

# Story 13-04: Git Credential Management

**Epic:** [Security & Authentication](epic.md)
**Status:** Not started
**Points:** 5

## Description

Manage git authentication across providers. GitHub: check gh auth status, login via OAuth device flow, verify SSH key is on GitHub, check required scopes (repo, read:org). GitLab: similar flow. Shows status dashboard: authenticated ✓/✗, SSH key registered ✓/✗, token scopes. Auto-refresh on auth changes.

## Acceptance Criteria

- [ ] No credentials stored in plaintext
- [ ] GPG-encrypted storage for all secrets
- [ ] Works in QEMU VM with no external network (for initial setup)
