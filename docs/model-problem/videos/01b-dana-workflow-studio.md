---
title: "01b — Dana defines the task workflow (deep-dive)"
parent: Video Production Plan
grand_parent: The Model Problem
layout: default
nav_order: 12
---

# Video 01b — Dana defines the task workflow
{: .no_toc }

**Protagonist:** Dana (Dev Manager)
**Arc:** Setup · *deep-dive supplement to [Video 01]({{ site.baseurl }}{% link model-problem/videos/01-dana-setup.md %})*
**Length:** 7:41
**Apps in frame:** App Launcher · Workflow Studio
**YouTube:** [https://youtu.be/FzUQs7tWkOo](https://youtu.be/FzUQs7tWkOo)
**Status:** ✅ Published

<div style="position: relative; padding-bottom: 56.25%; height: 0; overflow: hidden; max-width: 100%; margin: 1.5rem 0; border-radius: 8px;">
  <iframe
    src="https://www.youtube-nocookie.com/embed/FzUQs7tWkOo"
    title="RobOS Model Problem · Dana — Workflow Studio"
    frameborder="0"
    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
    allowfullscreen
    style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; border-radius: 8px;"></iframe>
</div>

## Story beat

A focused close-up on the Workflow Studio step from [Video 01]({{ site.baseurl }}{% link model-problem/videos/01-dana-setup.md %}). Dana defines the contract every later phase of the team will run on: issue types, workflow states, and the AI agent actions that fire on each state transition. Two paths — build a workflow type by hand, or describe the team in plain English and let RobOS draft the whole thing.

The workflow Dana saves here is what Pat's stories author against (Phase 2), what Jordan's CI gates fire transitions on (1.6 of his arc), and what Alex's task workspaces auto-provision into (Phase 3).

## Chapters

| Time | Section |
|:----:|:--------|
| 0:00 | Launch Workflow Studio |
| 0:04 | What Workflow Studio does — types, states, AI actions |
| 0:17 | AI Generate textarea |
| 0:22 | Add Issue Type |
| 0:29 | Configure label, color, states |
| 0:34 | Wire AI agent actions to transitions |
| 0:49 | Add a new state |
| 1:10 | Unsaved-changes guard |
| 1:24 | AI prompt — generate issue types from a description |
| 3:24 | Done — rich types with AI actions |
| 4:26 | Clear and re-generate seeded by a Jira project |

## Source

- Source capture + cues + youtube metadata: `packages/robos-test/run/demos/model-problem/06-dana-workflow-studio/`
- Regeneration: edit `cues.json` and re-run `node packages/robos-test/demos/narrate-source.js …` (full command in the per-folder `youtube.md`).
