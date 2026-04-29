---
title: "04 — Dana connects GitHub Copilot"
parent: Video Production Plan
grand_parent: The Model Problem
layout: default
nav_order: 4
---

# Video 04 — Dana connects GitHub Copilot
{: .no_toc }

**Protagonist:** Dana (Dev Manager)
**Arc:** Setup
**Target length:** 1:30
**Apps in frame:** App Launcher · Agents Manager

## Story beat

Git is wired up. But every AI textarea in RobOS — in Issue Manager, Workflow Studio, Git Projects, and everywhere else — needs an active AI provider before it can do anything useful. Dana opens Agents Manager, logs in to GitHub Copilot, and sets it as the active provider. One step, done for everyone on the team.

## Pre-seeded state

- `gh` CLI is installed and authenticated (done in Video 03 — Git Login Manager).
- `gh copilot` extension is installed (done in Video 02 — Dev Tools).
- Agents Manager detects GitHub Copilot as installed but **not yet authenticated** (yellow dot).

## Scene list

1. **Open Agents Manager (0:00–0:15)** — Dana opens App Launcher, types "agents", launches Agents Manager. The sidebar shows GitHub Copilot with a yellow dot (installed, not authenticated) and Claude Code with a red dot (not installed).

2. **Click Login (0:15–0:30)** — Dana clicks the GitHub Copilot row. The detail panel shows: gh CLI version, Copilot extension version, "not logged in". She clicks **Login / Re-auth**. A Tilix terminal opens running `gh auth login`.

3. **Device flow (0:30–1:00)** — Dana selects "GitHub.com" → "HTTPS" → the device code appears. Firefox opens to `github.com/login/device`. She enters the code, authorizes. *(Same flow viewers saw in Video 03 — this time it's for Copilot-scoped auth.)*

4. **All green (1:00–1:15)** — Back in Agents Manager, Dana clicks **Refresh**. GitHub Copilot dot turns green. Status: "Connected". Her username shows.

5. **Set as Active Provider (1:15–1:30)** — Dana clicks **Set as Active**. The "ACTIVE PROVIDER" badge appears. Every AI textarea in RobOS will now route through GitHub Copilot.

## Narration cues (draft)

| # | At | Text |
|:-:|:-:|:-----|
| 1 | 0:00 | Git is set up. Now RobOS needs to know which AI agent to use. That's what Agents Manager is for. |
| 2 | 0:18 | GitHub Copilot is installed but not yet logged in. Dana clicks Login — a terminal opens with the gh auth flow. |
| 3 | 0:35 | The device flow again — same as Git Login Manager, just a different scope: Copilot access. |
| 4 | 1:02 | Refresh. Green dot. Connected. Dana sets GitHub Copilot as the active provider. |
| 5 | 1:18 | Done. Every AI textarea in RobOS — Issue Manager, Workflow Studio, Git Projects — now has a working agent behind it. |

## Blockers / ready-checklist

- [ ] Confirm `gh copilot` extension is installed in Dana's VM session (Video 02 Dev Tools should have covered this).
- [ ] Confirm `gh auth login` picks up the correct scopes for Copilot (`copilot` scope or via the GitHub app authorization).
- [ ] Verify Agents Manager yellow→green transition works on Refresh after `gh auth login` completes.

## Deliverables produced by this video

- Dana's session has an authenticated GitHub Copilot active provider.
- All subsequent videos can use AI textareas without a separate auth step.
