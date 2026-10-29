---
title: "RobOS Preferences"
package: robos-preferences
category: core-desktop
icon: robos-preferences.svg
summary: "Settings window for RobOS apps: Config Sync & Sharing (cloud backup and shared configs), optional AI API mode, agent tiers, prompt security, GitHub accounts, IDE, notifications, journal and theme."
description: "Edits ~/.config/robos/settings.json, which other RobOS apps read. It also has selectors for the GitHub CLI accounts used by the git client and by Copilot."
---

> **Moving to a new machine or sharing your setup?** See [rowbose.com/config-management](https://rowbose.com/config-management/) for Config Sync & Sharing: back up to Google Drive, load a second machine, and share with family, new teammates or coworkers.

RobOS Preferences is one form, grouped into sections, that writes `~/.config/robos/settings.json`. Many RobOS apps read that file; this app does not apply settings to anything itself, except as noted for the knowledge graph.

## Sections

| Section | Settings |
|---|---|
| Config Sync & Sharing | A backup vault on Google Drive or a synced folder that every machine you own syncs with, shares for family, new teammates or coworkers, the shares you joined, and restore points. See [Config Sync & Sharing](#config-sync--sharing) below. |
| GitHub accounts | Choose the saved GitHub CLI account for the git client and a separate one for the Copilot agent (see below). |
| Code Review | Default code reviewer group, chosen from the groups the review library knows about. |
| AI Agents & API Mode | Off by default. **Use direct model APIs for quick requests**, the API provider (Anthropic, OpenAI, Gemini, Ollama), model and server URL, API keys (saved to `pass`), semantic Knowledge Graph search and its embeddings provider, and **Install API packages**. See [AI agents and API mode]({{ site.baseurl }}{% link ai-providers.md %}). The default agent CLI is chosen in RobOS Agents, not here. |
| Agent Tiers & Prompt Optimization | Model names for Tier 1, 2 and 3; Caveman prompt compression (mode and target tiers); DSPy teleprompter options. |
| Prompt Security & Guardrails | Policy mode (`redact`, `block`, `warn`, `audit-only`, `off`), scan toggles for secrets, PII and prompt injection, entropy threshold, allowlist and blocklist. |
| GitHub & Repos | Personal token, API URL, **Use gh CLI for auth**. |
| IDE & Workspaces | Default IDE (`intellij`, `vscode`, `cursor`, `neovim`), IDE path, auto-launch workspace. |
| Notifications & Sounds | Toast notifications, sounds, do-not-disturb on boot. |
| Work Journal & Knowledge Graph | Journal git repository, default knowledge graph branch, auto-commit. |
| System & Theme | Desktop theme (`dark` or `light`), auto-update. |

Click **Save All** to write the values. Changes are merged into the existing file, so keys set by other apps are kept. When you save, the Caveman and DSPy settings are also written to the knowledge graph as prompt strategy nodes if `robos-graph` is available. For the tier model names, see [Agent tiers]({{ site.baseurl }}{% link agent-tiers.md %}).

API keys in the AI section are saved straight to `pass` (`robos/ai/<provider>-key`) with their own **Save** button and never go into `settings.json`. Keys that older versions saved as plain text are moved into `pass` and removed from the file when Preferences opens, as long as the password store is set up.

{: .warning }
The GitHub personal token is shown in a password field but saved as plain text in `settings.json`. Prefer the GitHub CLI credential store (**Use gh CLI for auth**) or `pass` (see [Pass Manager]({{ '/apps/pass-manager/' | relative_url }})).

## Config Sync & Sharing

Keeps `~/.config/robos` and `~/.robos` in a private cloud folder and lets you share parts of it. The engine is `packages/robos-lib/config-sync.js`; the same operations are available from the terminal with `node packages/robos-lib/config-sync-cli.js`.

- **Backup vault**: **Create a new vault** (a Google Drive folder through a Cloud Suite Accounts sign-in, or a folder on this computer such as a Dropbox, OneDrive or Nextcloud folder), or **Use an existing vault** by pasting its folder link. The first sync asks whether to load the vault onto this machine, upload this machine, or choose file by file; nothing is deleted on a first sync. After that, **Review changes** and **Sync now** run a three-way compare (this machine, the vault, and the last sync), and a file changed on both sides is a conflict you resolve. Choose which categories are backed up under **What is backed up**.
- **Share**: pick a template (Family & friends, New teammate onboarding, Coworker handoff, Custom), the categories, the people (Google accounts), and an optional passphrase. **Preview** lists what goes out and which credentials were removed; **Publish share** creates the folder and gives the people read access. **Publish update** sends a new version.
- **Shared with me**: paste a share link to preview it, then **Join and apply**. Your own items stay: lists merge by id. **Check for updates**, **Apply update** and **Leave** (which removes only what the share added).
- **Restore points**: saved before any of the above changes a file on this machine. Restore one file or all of them.

Credentials (tokens, passwords, API keys, the Private Network machine key) never leave the machine, and paths in your home directory are stored as `${HOME}`. The full guide, with screenshots from the end-to-end tests, is at [rowbose.com/config-management](https://rowbose.com/config-management/).

## GitHub accounts

Open **GitHub accounts** to pick which saved GitHub CLI account is used for two purposes. **Git client** sets the active `gh` account, shared by Git Projects, GitHub task servers that use Git client authentication, and PR Review. **Copilot AI agent** sets the account for new Copilot sessions, and its credential is passed only in the Copilot process environment. **Save accounts** checks that the chosen Copilot account can reach Copilot and lists models, and fails with an error if not. **Add GitHub account** opens a terminal with the `gh` login flow. Only account names are kept, in `~/.config/robos/github-accounts.json`; the selectors cover github.com accounts only.

## Run it

Launch **RobOS Preferences** from the app launcher. Only one window runs at a time; opening it again focuses the window and shows the GitHub accounts section.
