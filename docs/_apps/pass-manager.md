---
title: "Pass Manager Vault"
package: pass-manager
category: security-vault
icon: pass-manager.svg
summary: "Desktop front end for the standard Unix password store (pass), with entries encrypted by GPG."
description: "Browse, add, edit, delete and copy entries in your ~/.password-store, and create a GPG key and store if you do not have one. It shells out to the pass and gpg commands."
related:
  - /big-wins/devops-security-pass.html
---

Pass Manager is a graphical client for [pass](https://www.passwordstore.org/). It does not have its own storage format. Every action runs a `pass` or `gpg` command against `~/.password-store`, so the same entries work in a terminal.

## Requirements

- `pass` and `gpg` on the PATH.
- `/usr/lib/gnupg/gpg-preset-passphrase`, used to cache the passphrase (see [Pass Unlock]({{ '/apps/pass-unlock/' | relative_url }})).

## Use it

1. Open **Pass Manager**. If `~/.password-store/.gpg-id` does not exist, the window shows **Set Up Your Password Store**. Enter a name, email and optional passphrase and click **Initialize Password Store**. This writes `~/.gnupg/gpg-agent.conf` (with `allow-preset-passphrase` and a 24-hour cache time), generates a 2048-bit RSA key, and runs `pass init <email>`. Key generation can take 15 to 30 seconds.
2. The left panel shows the store as a folder tree. Use the search box to filter it.
3. Select an entry to see its first line as the secret (hidden until you click the eye button) and the remaining lines as notes. **Copy Secret** puts the first line on the clipboard.
4. Click **+** to add an entry. Enter a path such as `work/github`, then choose a type: simple (secret value only), multiline (first line is the secret, the rest is notes), or generate random with a length (default 32). **Edit** and **Delete** act on the selected entry. The refresh button reloads the tree.

## Lock state

The header shows **Locked** when `gpg-agent` has no cached passphrase. Clicking the badge opens the Pass Unlock dialog. When the store is unlocked, a **Lock** button appears. It kills `gpg-agent`, deletes `~/.cache/robos/pass-unlock-time`, and adds a sticky entry to `~/.config/robos/notifications.json` so the toast daemon shows a prompt to log in again. On start, Pass Manager opens the unlock dialog itself if the cache is not active and the `pass-unlock` package is installed.

## Notes

- Only one Pass Manager window runs at a time; a second launch focuses the first.
- Entry paths are passed to `pass` inside double quotes by the main process, so avoid quote characters in entry names.
- Initialization writes a temporary log to `/tmp/pass-init.log`.
