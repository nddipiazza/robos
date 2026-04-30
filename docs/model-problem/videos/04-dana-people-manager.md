---
title: "04 — Dana sets up People Manager"
parent: Video Production Plan
grand_parent: The Model Problem
layout: default
nav_order: 4
---

# Video 04 — Dana sets up People Manager
{: .no_toc }

**Protagonist:** Dana (Dev Manager)
**Arc:** Setup
**Length:** 1:58
**Apps in frame:** App Launcher · People Manager
**YouTube:** [https://youtu.be/ZdvQwFQwwbg](https://youtu.be/ZdvQwFQwwbg)
**Status:** ✅ Published

<div style="position: relative; padding-bottom: 56.25%; height: 0; overflow: hidden; max-width: 100%; margin: 1.5rem 0; border-radius: 8px;">
  <iframe
    src="https://www.youtube-nocookie.com/embed/ZdvQwFQwwbg"
    title="RobOS Model Problem · Dana — People Manager"
    frameborder="0"
    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
    allowfullscreen
    style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; border-radius: 8px;"></iframe>
</div>

## Story beat

With RobOS configured (video 01) and an AI Agent active (video 02), the next thing Dana needs is *who's on the team*. People Manager is where every RobOS user gets created — name, email, role, GitHub login, the "this is me" marker. The hero feature: an AI textarea on the same screen that creates one or more users from a plain-English prompt or an at-mentioned external file (a roster, a contractor list, an org chart).

## Chapters

| Time | Section |
|:----:|:--------|
| 0:00 | Launch from the App Launcher |
| 0:04 | Current users |
| 0:12 | Select a user to edit |
| 0:16 | Edit and save |
| 0:22 | See your changes |
| 0:28 | Mark yourself in the roster |
| 0:33 | Search |
| 0:40 | Create a new user |
| 0:51 | Delete a user |
| 0:53 | AI prompt — create users from text |
| 1:00 | A simple description |
| 1:07 | User created |
| 1:15 | @-mention an external file |
| 1:28 | Wait while the AI plans |
| 1:35 | Done — every user from the document, created in one shot |

## Source

- Source capture + cues + youtube metadata: `packages/robos-test/run/demos/model-problem/dana-people-directory/`
- Regeneration: edit `cues.json` and re-run `node packages/robos-test/demos/narrate-source.js …` (full command in the per-folder `youtube.md`).
