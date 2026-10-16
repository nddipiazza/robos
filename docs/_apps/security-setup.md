---
title: "Security Setup Wizard"
package: security-setup
category: security-vault
icon: security-setup.svg
summary: "Five-step wizard that configures GPG pinentry, a GPG key, the pass store and an SSH key."
description: "Runs gpg, pass and ssh-keygen to set up the credentials RobOS needs. It does not configure git commit signing."
related:
  - /big-wins.html
---

Security Setup is a small wizard for a machine that has no GPG key, password store or SSH key yet. It runs the usual `gpg`, `pass` and `ssh-keygen` commands, so the results are ordinary files you can manage by hand. It checks what already exists and lets you skip steps that are done. The larger [RobOS Setup Wizard]({{ '/apps/robos-onboarding/' | relative_url }}) covers the same ground plus git identity, Chrome, GitHub login and AI keys.

## Requirements

`gpg`, `pass` and `ssh-keygen` installed. For the pinentry step, one of `pinentry-gtk-2`, `pinentry-qt`, `pinentry-gnome3` or `pinentry` at `/usr/bin`.

## The steps

1. **Pinentry.** **Configure Secure Dialog** writes `~/.gnupg/gpg-agent.conf` with the first pinentry program it finds, a 24-hour cache (`default-cache-ttl 86400`, `max-cache-ttl 86400`) and `allow-preset-passphrase`, and reloads `gpg-agent`. This replaces an existing `gpg-agent.conf`.
2. **GPG Key.** If keys exist, choose one with **Use Selected Key**. Otherwise enter a name, email and passphrase and click **Generate GPG Key**, which creates a 4096-bit RSA key with no expiry.
3. **Pass Store.** **Initialize Pass Store** runs `pass init <key>`, creating `~/.password-store`.
4. **SSH Key.** If `~/.ssh/id_ed25519`, `id_ecdsa` or `id_rsa` exists you can continue. Otherwise enter a comment and optional passphrase and click **Generate SSH Key** to create `~/.ssh/id_ed25519` with `ssh-keygen -t ed25519`. The public key is shown so you can add it to GitHub yourself.
5. **Done.** The credentials are in place. Use [Pass Manager]({{ '/apps/pass-manager/' | relative_url }}) to work with the store.

{: .warning }
**Reset** in the header deletes the GPG key named in `~/.password-store/.gpg-id`, removes `~/.password-store` entirely and deletes `~/.gnupg/gpg-agent.conf`. The app asks for confirmation first, but stored passwords cannot be recovered afterwards.

## Run it

Launch **Security Setup** from the app launcher, or run `npm start` in `packages/security-setup`.
