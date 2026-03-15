---
layout: default
title: Pass Unlock
parent: RobOS App Suite
nav_order: 13
---

# Pass Unlock

> Daily GPG passphrase unlock dialog that pre-caches the passphrase in `gpg-agent` for the work session.

---

## Overview

Pass Unlock is a minimal, always-on-top dialog that collects the user's GPG passphrase once per day and pre-loads it into `gpg-agent` via `gpg-preset-passphrase`. After unlocking, `pass` commands and [Pass Manager](pass-manager) operate without further passphrase prompts for the duration of the `gpg-agent` cache TTL.

---

## Features

- Minimal full-screen-centred unlock dialog — one field, one button
- Calls `gpg-preset-passphrase` to inject the passphrase into the running `gpg-agent`
- Records unlock timestamp so it does not re-prompt during the same day
- Writes an access log entry on each unlock
- `alwaysOnTop: true` — appears above other windows when triggered
- Can be triggered manually or automatically at login via `autostart`

---

## How to Open

```bash
/usr/local/share/robos/pass-unlock/launch.sh
```

Auto-launched at desktop login by the autostart entry installed in `~/.config/autostart/`.

---

## Usage

1. At login (or on demand), the dialog appears.
2. Enter your GPG passphrase and press **Unlock**.
3. If the passphrase is correct, the dialog closes and the passphrase is cached in `gpg-agent`.
4. If incorrect, an error message appears and you can try again.

If the passphrase was already cached today, the dialog auto-closes without prompting.

---

## Configuration

No user-facing configuration. Internal constants:

| Constant | Default | Description |
|----------|---------|-------------|
| Cache validity | 1 day | Checked via `~/.cache/robos/pass-unlock-time` |
| GPG preset binary | `/usr/lib/gnupg/gpg-preset-passphrase` | Path to `gpg-preset-passphrase` |

---

## IPC Reference

| Channel | Direction | Description |
|---------|-----------|-------------|
| `unlock-pass` | Renderer → Main | Attempts to preset the passphrase; returns `{ ok, error? }` |
| `check-unlock-status` | Renderer → Main | Returns whether unlock is already cached for today |

---

## Data & Files

| Path | Description |
|------|-------------|
| `~/.cache/robos/pass-unlock-time` | Timestamp of last successful unlock |
| `~/.cache/robos/pass-access.log` | Append-only unlock access log |
| `~/.password-store/` | Pass store (used to identify GPG key fingerprint) |
| `~/.gnupg/` | GPG keyring and agent socket |

---

## Related Apps

- [Pass Manager](pass-manager) — GUI pass store browser; requires unlock first
- [Security Setup](security-setup) — first-run GPG + pass initialiser
