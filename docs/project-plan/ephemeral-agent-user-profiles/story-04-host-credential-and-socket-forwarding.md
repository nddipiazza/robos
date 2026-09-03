---
nav_exclude: true
---

# Story: Host Identity, Credential & Socket Forwarding

**Epic:** [Ephemeral Agent User Profiles with Direct Host Display Bridging](epic.md)  
**Status:** Done  
**Points:** 5  

## Description

Provide secure tunneling and inheritance of host identity assets into the ephemeral profile. Sets POSIX ACLs and socket links on `SSH_AUTH_SOCK` and GPG agent sockets so the agent user can perform git operations without exposing private key files directly. Automatically injects host `.gitconfig` (author identity, credential helpers) and propagates AI model API tokens (`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GEMINI_API_KEY`) from the host's RobOS secret store.

## Acceptance Criteria

- [x] Agent user can clone, fetch, and push via SSH using the forwarded `SSH_AUTH_SOCK` without copying raw private keys into `/home/my-agent-...`
- [x] Git commit identity matches host developer settings (`user.name`, `user.email`)
- [x] RobOS API credentials and environment variables are injected into the agent's execution environment
- [x] Private host files outside of explicitly bridged sockets remain inaccessible (enforced by Linux file permissions)
- [x] Verified with unit and automated E2E tests (`packages/robos-test/tests/robos-profiled/identity-forwarder.test.js`) and persistent walkthrough archive in `~/.robos/development/walkthroughs/robos-profiled-identity/`.
