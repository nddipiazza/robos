# Story 19-02: OAuth PKCE Flow Execution

**Epic:** [OAuth Provider Integration](epic.md)
**Status:** Not started
**Points:** 8

## Description

Implement the actual OAuth 2.0 Authorization Code flow with PKCE for each configured provider. When a user clicks "Connect" on a provider, RobOS opens the provider's authorization page in a browser, runs a local callback server (`localhost:9871`), captures the authorization code, and exchanges it for an access token.

## Acceptance Criteria

- [ ] OAuth PKCE flow works for GitHub, Google, Jira, GitLab
- [ ] Local callback server captures authorization code
- [ ] Token exchange completes and stores access + refresh tokens
- [ ] Error handling for denied permissions, expired codes, network failures
- [ ] Tokens stored securely in the pass store (not plaintext JSON)
