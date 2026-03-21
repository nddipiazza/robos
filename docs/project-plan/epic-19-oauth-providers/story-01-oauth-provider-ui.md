# Story 19-01: OAuth Provider Configuration UI

**Epic:** [OAuth Provider Integration](epic.md)
**Status:** Not started
**Points:** 5

## Description

Electron app (`robos-auth`) for managing OAuth provider configurations. Register providers (GitHub, Google, Jira, GitLab, Slack, custom OIDC), configure client ID/secret, scopes, and callback URLs. Shows connection status per provider. The UI shell already exists in `roboto-os/packages/robos-auth/` — this story ports it to the current codebase and wires it into the app registry.

## Acceptance Criteria

- [ ] List, add, edit, and delete OAuth provider configurations
- [ ] Pre-configured defaults for GitHub, Google, Jira, GitLab, Slack
- [ ] Custom OIDC provider support
- [ ] Provider enable/disable toggle
- [ ] Connection status badge per provider
- [ ] Identity management (current user UID linked to People Directory)
- [ ] Configurations stored in `~/.config/robos/auth/providers.json`
