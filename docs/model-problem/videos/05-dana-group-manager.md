---
title: "05 — Dana sets up Group Manager"
parent: Video Production Plan
grand_parent: The Model Problem
layout: default
nav_order: 5
---

# Video 05 — Dana sets up Group Manager
{: .no_toc }

**Protagonist:** Dana (Dev Manager)
**Arc:** Setup
**Length:** 3:08
**Apps in frame:** App Launcher · Group Manager (Group Developer Settings)
**YouTube:** [https://youtu.be/mxnPjiJ0G8I](https://youtu.be/mxnPjiJ0G8I)
**Status:** ✅ Published

<div style="position: relative; padding-bottom: 56.25%; height: 0; overflow: hidden; max-width: 100%; margin: 1.5rem 0; border-radius: 8px;">
  <iframe
    src="https://www.youtube-nocookie.com/embed/mxnPjiJ0G8I"
    title="RobOS Model Problem · Dana — Group Developer Settings"
    frameborder="0"
    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
    allowfullscreen
    style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; border-radius: 8px;"></iframe>
</div>

## Story beat

With users in place (video 03), Dana groups them. Group Manager owns the developer side of every team: which repos they own, what software they use, how new members get onboarded, what secrets they share, what CI environments they see, who's on the team, and what RobOS Workspaces belong to them. Same hero pattern as People Manager: an AI textarea that drafts a whole group — repos, members, software, onboarding steps — from a prompt or an @-mentioned external file.

## Chapters

| Time | Section |
|:----:|:--------|
| 0:00 | Launch from the App Launcher |
| 0:04 | Group list |
| 0:13 | Create a new group |
| 0:16 | The new group appears |
| 0:24 | Git Projects tab — add and remove repos |
| 0:37 | Software Installations — toolchains per group |
| 0:56 | Onboarding steps — the AI's runbook for new joiners |
| 1:11 | Secrets — per-group credential vault |
| 1:18 | CI management — environments visible in RobOS CI |
| 1:28 | Members — who's on the team and what role |
| 1:33 | Workspaces — RobOS Workspaces owned by the group |
| 1:39 | AI assistant — generate groups from a prompt |
| 2:10 | @-mention a file describing the groups |
| 2:24 | Generate |
| 2:36 | Wait while the AI plans |
| 2:45 | Done — every group and member, created automatically |

## Source

- Source capture + cues + youtube metadata: `packages/robos-test/run/demos/model-problem/dana-group-directory/`
- Regeneration: edit `cues.json` and re-run `node packages/robos-test/demos/narrate-source.js …` (full command in the per-folder `youtube.md`).
