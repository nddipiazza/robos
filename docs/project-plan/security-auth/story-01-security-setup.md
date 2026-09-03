---
nav_exclude: true
---

# Story 13-01: Security Setup

**Epic:** [Security & Authentication](epic.md)
**Status:** Not started
**Points:** 5

## Description

First-run wizard for initializing security keys. Generates: RSA-4096 GPG key pair, Ed25519 SSH key pair. Initializes pass password store with the GPG key. Adds SSH public key to GitHub (via API with token). Guides user through each step with progress and verification. Runs on first login if keys don't exist.

## Acceptance Criteria

- [ ] No credentials stored in plaintext
- [ ] GPG-encrypted storage for all secrets
- [ ] Works in QEMU VM with no external network (for initial setup)
