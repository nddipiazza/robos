---
nav_exclude: true
---

# Story 25-02: Host Credential & Socket Tunneling

**Epic:** [RobOS Desktop Agents](epic.md)
**Status:** Not started
**Points:** 5

## Description

Build the credential tunneling plumbing so that host session settings, credentials, and authentication agents are accessible within the sub-agent Linux session without manual setup or exposing secrets in cleartext.

## Acceptance Criteria

- [ ] `SSH_AUTH_SOCK` socket is forwarded into `/run/robos/agent-<task-id>/ssh.sock` allowing git SSH operations.
- [ ] GPG agent socket is forwarded for git commit signing.
- [ ] Host `.gitconfig` and credentials inherit seamlessly into agent session.
- [ ] Environment variables and API tokens from host `~/.config/robos/` are securely injected.
