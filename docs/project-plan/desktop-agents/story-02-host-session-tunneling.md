---
nav_exclude: true
---

# Story: Host Credential & Socket Tunneling

**Epic:** [RobOS Desktop Agents](epic.md)  
**Status:** Done  
**Points:** 5  

## Description

Build the credential tunneling plumbing so that host session settings, credentials, and authentication agents are accessible within the sub-agent Linux session without manual setup or exposing secrets in cleartext.

## Acceptance Criteria

- [x] `SSH_AUTH_SOCK` socket is forwarded into sub-agent home (`.ssh-auth-sock`) allowing git SSH operations without exposing raw private keys
- [x] GPG agent socket is forwarded (`.gnupg-agent-sock`) for git commit signing
- [x] Host `.gitconfig` and credentials inherit seamlessly into agent session
- [x] Environment variables and API tokens from host `~/.config/robos/` are securely injected
- [x] Verified with unit and automated E2E tests (`packages/robos-test/tests/robos-agentd/session-tunnel.test.js`) and persistent walkthrough archive in `~/.robos/development/walkthroughs/robos-agentd-tunnel/`.
