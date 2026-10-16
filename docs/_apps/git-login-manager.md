---
title: "Git Login Manager"
package: git-login-manager
category: security-vault
icon: git-login-manager.svg
summary: "Checks that GitHub access works (gh login, SSH key, SSH connection, git identity) and walks you through fixing what fails."
description: "Git Login Manager is a GitHub-only health check that runs in the background, opens when something is broken, and can run gh login, generate an SSH key and upload it to GitHub."
---

Git Login Manager keeps the GitHub credentials that other RobOS apps depend on in working order. It does not handle GitLab or Gitea, and it does not store personal access tokens; login uses the GitHub CLI's browser flow.

## The four checks

| Check | How it is tested | If it fails |
|---|---|---|
| **GitHub CLI (gh) Authentication** | `gh auth status` reports "logged in" | **Login** runs `gh auth login --web --hostname github.com --scopes admin:public_key` and shows the one-time code, with **Copy** and **Open Browser Again** |
| **SSH key exists** | `~/.ssh/id_ed25519`, `id_ecdsa` or `id_rsa` is present | **Generate Key** runs `ssh-keygen` for an Ed25519 or RSA 4096 key, with a comment and optional passphrase. It refuses to overwrite an existing key |
| **SSH to github.com** | `ssh -T git@github.com` (a success result is cached for 10 minutes) | **Add to GitHub** shows the public key and runs `gh ssh-key add`. If the token lacks the `admin:public_key` scope, **Re-auth gh** runs `gh auth refresh -s admin:public_key` |
| **git identity configured** | `git config --global user.name` and `user.email` are set | **Configure** saves both values |

**Check now** runs all checks immediately.

## Behavior you should know about

- The window starts hidden. The checks run at startup and every 5 minutes (`CHECK_INTERVAL_MS` in `main.js`; the window's "Next check in" label counts down from 60 seconds, which does not match), and the window opens by itself the first time any check fails, unless onboarding is still in progress.
- If the git identity is missing and `gh` is logged in, the app fills `user.name` and `user.email` from your GitHub profile (using the `id+login@users.noreply.github.com` address if your email is private).
- On every check it sets the global git option `url."git@github.com:".insteadOf "https://github.com/"` if it is not set, so `https://github.com/...` clones go over SSH. Remove it with `git config --global --unset url.git@github.com:.insteadOf` if you do not want that.
- When all checks pass it refreshes `~/.config/robos/gh-repos-cache.json` (your repositories and those of your organizations, at most once an hour). Other apps use this list for repository pickers.
- [Desktop Manager]({{ '/apps/desktop-manager/' | relative_url }}) restarts this app if it stops.

## Requirements

`gh`, `ssh`, `ssh-keygen` and `git` on the `PATH`. Source: [`packages/git-login-manager`](https://github.com/nddipiazza/robos/tree/main/packages/git-login-manager).
