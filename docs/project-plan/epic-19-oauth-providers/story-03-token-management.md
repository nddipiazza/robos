# Story 19-03: Token Storage and Auto-Refresh

**Epic:** [OAuth Provider Integration](epic.md)
**Status:** Not started
**Points:** 5

## Description

Manage OAuth tokens lifecycle: store tokens in the GPG-encrypted pass store, auto-refresh expired tokens using refresh tokens, and expose a token API for other RobOS apps (Task Servers, Git Projects, AI Agent Manager) to request valid tokens without handling OAuth themselves.

## Acceptance Criteria

- [ ] Access and refresh tokens stored in pass store under `robos/oauth/{provider-id}`
- [ ] Auto-refresh runs before token expiry (background check every 5 minutes)
- [ ] Other apps can request a valid token via IPC: `get-oauth-token(providerId)`
- [ ] Expired tokens with no refresh token trigger a re-auth notification
- [ ] Token revocation support (disconnect a provider)
