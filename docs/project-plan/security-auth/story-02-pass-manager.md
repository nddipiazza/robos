---
nav_exclude: true
---

# Story 13-02: Pass Manager

**Epic:** [Security & Authentication](epic.md)
**Status:** Not started
**Points:** 5

## Description

GUI for the pass (password-store) Unix utility. Browse password tree, copy passwords to clipboard, add/edit/delete entries, generate random passwords. Search across all entries. Auto-clear clipboard after 45 seconds. Requires GPG passphrase (cached via gpg-agent). Dark theme with secure input fields.

## Acceptance Criteria

- [ ] No credentials stored in plaintext
- [ ] GPG-encrypted storage for all secrets
- [ ] Works in QEMU VM with no external network (for initial setup)
