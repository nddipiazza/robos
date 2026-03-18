# Story 13-03: Pass Unlock

**Epic:** [Security & Authentication](epic.md)
**Status:** Not started
**Points:** 3

## Description

Simple dialog that appears on login (autostart) prompting for GPG passphrase. Caches the passphrase in gpg-agent for the session (configurable TTL, default: 8 hours). Prevents repeated passphrase prompts throughout the day. Shows pass store health status after unlock.

## Acceptance Criteria

- [ ] No credentials stored in plaintext
- [ ] GPG-encrypted storage for all secrets
- [ ] Works in QEMU VM with no external network (for initial setup)
