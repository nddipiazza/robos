---
layout: default
title: Pass Manager
parent: RobOS App Suite
nav_order: 12
---

# Pass Manager

> GUI front-end for the `pass` GPG-encrypted password store.

---

## Overview

Pass Manager provides a dark-themed graphical interface over the Unix [pass](https://www.passwordstore.org/) password manager. It lets developers view, create, edit, copy, and delete credentials stored in `~/.password-store/` without dropping to a terminal. GPG decryption happens locally — no credentials leave the machine.

---

## Features

- Tree view of the password store hierarchy
- Decrypt and copy a password to clipboard (auto-clears after 45 s)
- Create new entries (name + password, with optional metadata)
- Edit existing entries in a secure inline editor
- Delete entries with confirmation
- Search / filter the store tree
- Requires GPG passphrase to be pre-unlocked via [Pass Unlock](pass-unlock)

---

## How to Open

```bash
/usr/local/share/robos/pass-manager/launch.sh
```

---

## Usage

### Viewing passwords

The left panel shows the store tree. Click any entry to decrypt and display it in the right panel.

### Copying to clipboard

Click **📋 Copy Password**. The password is copied to clipboard and automatically cleared after 45 seconds.

### Adding a new entry

1. Click **+ New Entry**.
2. Enter a path/name (e.g. `github/work-token`) and the secret value.
3. Click **Save**. The entry is encrypted with your GPG key and stored.

### Editing an entry

Select an entry and click **✏ Edit**. Modify the content in the secure text area and click **Save**.

---

## Configuration

Pass Manager uses the standard `pass` configuration. No RobOS-specific config keys.

| Variable | Description |
|----------|-------------|
| `PASSWORD_STORE_DIR` | Override store location (default: `~/.password-store`) |
| `GNUPGHOME` | Override GPG home directory (default: `~/.gnupg`) |

GPG passphrase must be pre-unlocked via [Pass Unlock](pass-unlock) before using this app (or the GPG agent will prompt).

---

## IPC Reference

| Channel | Direction | Description |
|---------|-----------|-------------|
| `list-pass-entries` | Renderer → Main | Returns the store tree as a nested object |
| `get-pass-entry` | Renderer → Main | Decrypts and returns an entry's content |
| `copy-pass-entry` | Renderer → Main | Decrypts and places password on clipboard |
| `create-pass-entry` | Renderer → Main | Creates a new encrypted entry |
| `edit-pass-entry` | Renderer → Main | Overwrites an existing entry |
| `delete-pass-entry` | Renderer → Main | Deletes an entry from the store |

---

## Data & Files

| Path | Description |
|------|-------------|
| `~/.password-store/` | GPG-encrypted `.gpg` files (the `pass` store) |
| `~/.gnupg/` | GPG key ring and agent configuration |

---

## Related Apps

- [Pass Unlock](pass-unlock) — daily GPG passphrase unlock dialog, must be run before using Pass Manager
- [Security Setup](security-setup) — first-run initialiser for the GPG key and pass store
