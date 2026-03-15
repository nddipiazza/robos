---
layout: default
title: Security Setup
parent: RobOS App Suite
nav_order: 14
---

# Security Setup

> First-run wizard for initialising GPG keys and the `pass` password store.

---

## Overview

Security Setup is a guided, single-use wizard that walks a new RobOS user through the steps required to establish a secure local credential store. It generates a GPG key pair, configures `gpg-agent` for smart caching, and initialises the `pass` store with the new key. After completion, [Pass Manager](pass-manager) and [Pass Unlock](pass-unlock) are fully operational.

---

## Features

- Guided three-step flow: Generate Key → Configure Agent → Initialise Store
- Creates a GPG key with sensible defaults (RSA 4096, 2-year expiry)
- Writes `~/.gnupg/gpg-agent.conf` with configurable cache TTLs
- Initialises `~/.password-store/` with `pass init <key-fingerprint>`
- Displays the generated key fingerprint for backup/export
- `resizable: false` — intentionally compact; not a general-purpose GPG tool
- Idempotent — re-running detects an existing key and store and skips those steps

---

## How to Open

```bash
/usr/local/share/robos/security-setup/launch.sh
```

Automatically launched by the RobOS onboarding flow if no GPG key is found.

---

## Usage

### Step 1 — Generate GPG key

Enter a name and email address. Click **Generate Key**. The wizard runs `gpg --batch --gen-key` with the provided inputs and a 4096-bit RSA key type.

### Step 2 — Configure gpg-agent

The wizard writes `~/.gnupg/gpg-agent.conf` setting:
- `default-cache-ttl 86400` (24 h)
- `max-cache-ttl 86400`

Click **Apply Configuration** to reload the agent (`gpg-connect-agent reloadagent`).

### Step 3 — Initialise pass store

Click **Initialise Store**. The wizard runs `pass init <fingerprint>`. The store is ready at `~/.password-store/`.

---

## Configuration

No user-editable config file. The wizard writes:

| Path | Content |
|------|---------|
| `~/.gnupg/gpg-agent.conf` | Cache TTL settings |
| `~/.password-store/.gpg-id` | GPG key fingerprint used to encrypt entries |

---

## IPC Reference

| Channel | Direction | Description |
|---------|-----------|-------------|
| `check-gpg-state` | Renderer → Main | Returns `{ hasKey, hasStore, agentRunning }` |
| `generate-gpg-key` | Renderer → Main | Generates a new GPG key; returns fingerprint |
| `configure-gpg-agent` | Renderer → Main | Writes `gpg-agent.conf` and reloads the agent |
| `init-pass-store` | Renderer → Main | Runs `pass init` with the provided fingerprint |

---

## Data & Files

| Path | Description |
|------|-------------|
| `~/.gnupg/` | GPG keyring and agent config |
| `~/.gnupg/gpg-agent.conf` | Written by this wizard |
| `~/.password-store/` | Initialised by this wizard |

---

## Related Apps

- [Pass Manager](pass-manager) — day-to-day password store GUI
- [Pass Unlock](pass-unlock) — daily passphrase unlock
