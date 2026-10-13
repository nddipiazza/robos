---
title: "Pass Unlock Daemon"
package: pass-unlock
category: security-vault
icon: pass-unlock.svg
summary: "Small dialog that asks for your GPG passphrase once a day and caches it in gpg-agent."
description: "Presets your GPG passphrase into gpg-agent so pass and agents can read secrets for the day, and shows how many secret accesses were logged."
related:
  - /big-wins.html
---

Pass Unlock is a small always-on-top window, not a background daemon. It asks for your GPG passphrase and hands it to `gpg-agent`, so tools that call `pass` do not each prompt for it.

## What it does

1. On start it checks whether the store exists (`~/.password-store/.gpg-id`) and whether `gpg-agent` already has a cached key. If the unlock time recorded today is still valid, it shows "Pass is unlocked for today" and the time.
2. Otherwise it shows a greeting and a passphrase field. Click **Unlock for Today** (or press Enter) and it runs `gpg-preset-passphrase --preset <keygrip>` for every secret key in your keyring. A wrong passphrase shows an error and nothing is cached.
3. On success it writes the Unix time to `~/.cache/robos/pass-unlock-time`, appends `<timestamp>|user|unlock|<daily-unlock>` to `~/.cache/robos/pass-access.log`, and closes after a few seconds.
4. **Skip - remind me later** quits without unlocking.

The dialog also shows counts of secret accesses (total, by agent and by user) read from `~/.cache/robos/pass-access.log` for the current date. In this repository only Pass Unlock itself writes to that file, and only for the unlock event.

## Requirements

- `gpg` and `/usr/lib/gnupg/gpg-preset-passphrase`.
- `allow-preset-passphrase` in `~/.gnupg/gpg-agent.conf`. [Pass Manager]({{ '/apps/pass-manager/' | relative_url }}) and [Security Setup Wizard]({{ '/apps/security-setup/' | relative_url }}) write this setting when they create keys; confirm for your own key.

## Related

[Pass Manager]({{ '/apps/pass-manager/' | relative_url }}) opens this dialog when its header badge shows Locked. Its Lock button clears the cache and posts a notification that links back here. A second launch of Pass Unlock focuses the existing window.
