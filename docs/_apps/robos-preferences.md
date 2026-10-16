---
title: "RobOS Preferences"
package: robos-preferences
category: core-desktop
icon: robos-preferences.svg
summary: "Settings window for RobOS apps: AI provider and models, agent tiers, prompt security, GitHub accounts, IDE, notifications, journal and theme."
description: "Edits ~/.config/robos/settings.json, which other RobOS apps read. It also has selectors for the GitHub CLI accounts used by the git client and by Copilot."
---

RobOS Preferences is one form, grouped into sections, that writes `~/.config/robos/settings.json`. Many RobOS apps read that file; this app does not apply settings to anything itself, except as noted for the knowledge graph.

## Sections

| Section | Settings |
|---|---|
| GitHub accounts | Choose the saved GitHub CLI account for the git client and a separate one for the Copilot agent (see below). |
| Code Review | Default code reviewer group, chosen from the groups the review library knows about. |
| AI Provider & Models | Primary provider (`claude`, `openai`, `gemini`, `local`), API keys, default model name. |
| Agent Tiers & Prompt Optimization | Model names for Tier 1, 2 and 3; Caveman prompt compression (mode and target tiers); DSPy teleprompter options. |
| Prompt Security & Guardrails | Policy mode (`redact`, `block`, `warn`, `audit-only`, `off`), scan toggles for secrets, PII and prompt injection, entropy threshold, allowlist and blocklist. |
| GitHub & Repos | Personal token, API URL, **Use gh CLI for auth**. |
| IDE & Workspaces | Default IDE (`intellij`, `vscode`, `cursor`, `neovim`), IDE path, auto-launch workspace. |
| Notifications & Sounds | Toast notifications, sounds, do-not-disturb on boot. |
| Work Journal & Knowledge Graph | Journal git repository, default knowledge graph branch, auto-commit. |
| System & Theme | Desktop theme (`dark` or `light`), auto-update. |

Click **Save All** to write the values. Changes are merged into the existing file, so keys set by other apps are kept. When you save, the Caveman and DSPy settings are also written to the knowledge graph as prompt strategy nodes if `robos-graph` is available. For the tier model names, see [Agent tiers]({{ site.baseurl }}{% link agent-tiers.md %}).

{: .warning }
API keys and the GitHub token are shown in password fields but saved as plain text in `settings.json`. For secrets, prefer `pass` (see [Pass Manager]({{ '/apps/pass-manager/' | relative_url }})) and the GitHub CLI credential store.

## GitHub accounts

Open **GitHub accounts** to pick which saved GitHub CLI account is used for two purposes. **Git client** sets the active `gh` account, shared by Git Projects, GitHub task servers that use Git client authentication, and PR Review. **Copilot AI agent** sets the account for new Copilot sessions, and its credential is passed only in the Copilot process environment. **Save accounts** checks that the chosen Copilot account can reach Copilot and lists models, and fails with an error if not. **Add GitHub account** opens a terminal with the `gh` login flow. Only account names are kept, in `~/.config/robos/github-accounts.json`; the selectors cover github.com accounts only.

## Run it

Launch **RobOS Preferences** from the app launcher. Only one window runs at a time; opening it again focuses the window and shows the GitHub accounts section.
