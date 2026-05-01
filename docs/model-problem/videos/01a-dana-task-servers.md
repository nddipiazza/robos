---
title: "01a — Dana wires Jira via Task Servers (deep-dive)"
parent: Video Production Plan
grand_parent: The Model Problem
layout: default
nav_order: 11
---

# Video 01a — Dana wires Jira via Task Servers
{: .no_toc }

**Protagonist:** Dana (Dev Manager)
**Arc:** Setup · *deep-dive supplement to [Video 01]({{ site.baseurl }}{% link model-problem/videos/01-dana-setup.md %})*
**Length:** 1:12
**Apps in frame:** Pass Manager · Task Servers
**YouTube:** [https://youtu.be/vygBUoocpbg](https://youtu.be/vygBUoocpbg)
**Status:** ✅ Published

<div style="position: relative; padding-bottom: 56.25%; height: 0; overflow: hidden; max-width: 100%; margin: 1.5rem 0; border-radius: 8px;">
  <iframe
    src="https://www.youtube-nocookie.com/embed/vygBUoocpbg"
    title="RobOS Model Problem · Dana — Task Servers"
    frameborder="0"
    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
    allowfullscreen
    style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; border-radius: 8px;"></iframe>
</div>

## Story beat

A focused close-up on the Jira step from [Video 01]({{ site.baseurl }}{% link model-problem/videos/01-dana-setup.md %}). Two apps, one rule: API tokens live in the password store, never in plain-text config. Dana stashes the Jira token in Pass Manager, then opens Task Servers and references the entry by pass-path.

## Chapters

| Time | Section |
|:----:|:--------|
| 0:00 | Open Pass Manager and store the Jira API token |
| 0:09 | Note the pass entry name |
| 0:20 | Open RobOS Task Servers |
| 0:38 | Paste the Jira URL |
| 0:44 | Username |
| 0:49 | Pass path for the Jira token |
| 0:55 | Project keys |
| 1:01 | Test the connection |
| 1:06 | Save the task server |

## Source

- Source capture + cues + youtube metadata: `packages/robos-test/run/demos/model-problem/05-dana-task-servers/`
- Regeneration: edit `cues.json` and re-run `node packages/robos-test/demos/narrate-source.js …` (full command in the per-folder `youtube.md`).
