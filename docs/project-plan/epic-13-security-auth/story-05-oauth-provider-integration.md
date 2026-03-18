# Story 13-05: OAuth Provider Integration

**Epic:** [Security & Authentication](epic.md)
**Status:** Not started
**Points:** 5

## Description

Generic OAuth provider management for RobOS apps. Register OAuth apps, store tokens securely in pass store, auto-refresh expired tokens. Used by: Task Servers (Jira/GitHub auth), Git Projects (repo access), AI Agent Manager (API keys). Provider UI shows all connected accounts with status and permissions.

## Acceptance Criteria

- [ ] No credentials stored in plaintext
- [ ] GPG-encrypted storage for all secrets
- [ ] Works in QEMU VM with no external network (for initial setup)
