---
title: "RobOS Setup Wizard"
package: robos-onboarding
category: security-vault
icon: robos-onboarding.svg
summary: "Eleven-step first-run wizard for GPG, pass, pinentry, git identity, SSH, Chrome, GitHub login, AI agent keys and optional tools."
description: "Walks through the credential and tooling setup a RobOS workstation needs, running the real gpg, pass, ssh-keygen and gh commands, and records completion in ~/.config/robos."
---

The Setup Wizard prepares a fresh Linux account for RobOS. Most steps run a normal command (`gpg`, `pass`, `ssh-keygen`, `gh`) on your behalf, so you can reproduce each one by hand.

## Requirements

`pass` must be installed first. If it is missing, the wizard shows a banner with `sudo apt-get install -y pass`. `gpg` is also needed.

## The steps

| Step | What it does |
|---|---|
| 1. GPG Master Key | Detects an existing key, or generates a 4096-bit RSA key from a name, email and optional passphrase (`gpg --batch --generate-key`). |
| 2. Password Store (pass) | Runs `pass init <key id>` to create `~/.password-store`. |
| 3. GUI Pinentry | Adds `pinentry-program` (gnome3, gtk-2 or curses, whichever is installed) and very long cache times to `~/.gnupg/gpg-agent.conf` if no `pinentry-program` line exists, then reloads `gpg-agent`. |
| 4. Git User Profile | Saves `user.name` and `user.email` to your global git config. |
| 5. SSH Keypair Setup | Generates an Ed25519 key (`~/.ssh/id_ed25519`), shows the public key with **Copy Public Key**, and has **Test GitHub SSH Connection**. |
| 6. Google Chrome Browser | Checks for Chrome. **Install / Reinstall Google Chrome** downloads the `.deb` from `dl.google.com` and installs it with `sudo`. Also **Set Chrome as Default Browser**. |
| 7. GitHub Auth (optional) | Starts `gh auth login --web` and opens the GitHub device page in Chrome, or accepts a personal access token. **Upload SSH Key to GitHub** is also offered. You can skip this step. |
| 8. AI Agents | Optional. Saves provider choices to `~/.config/robos/preferences.json` and stores any API keys you enter in `pass` under `robos/ai/anthropic-key`, `robos/ai/openai-key` or `robos/ai/gemini-key`. A test button checks that the Copilot, Claude or Gemini CLI or key is present. |
| 9. Git Projects (optional) | Points you to the Git Projects app. |
| 10. Dev Apps (optional) | Points you to the Software Center. |
| 11. Complete & Provision | Writes `~/.config/robos/onboarding-completed.json`, turns GNOME notification banners back on, and launches Dev Central through the desktop manager socket. |

Each step ends with a "Move to Step N" button, and **Back**, **Skip** and **Next Step** buttons run along the bottom. Progress per step is saved through `robos-lib/onboarding-state`.

## Limits

- Step 11 describes automated workspace provisioning, but the code only runs an `echo` in a background shell; it does not provision repositories.
- The Chrome and tool installers need `sudo` and network access.
- The `ROBOS_SCENARIO` environment variable makes several steps return canned results; it exists for tests.

## Related

[Security Setup Wizard]({{ '/apps/security-setup/' | relative_url }}) covers GPG, SSH and git signing on its own. [Pass Manager]({{ '/apps/pass-manager/' | relative_url }}) is the GUI for the store created in step 2. Launch **RobOS Setup Wizard** from the app launcher.
