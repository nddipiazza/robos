---
title: "02 — Dana installs the team toolchain"
parent: Video Production Plan
grand_parent: The Model Problem
layout: default
nav_order: 2
---

# Video 02 — Dana installs the team toolchain
{: .no_toc }

**Protagonist:** Dana (Dev Manager)
**Arc:** Setup
**Length:** ~2:30
**Apps in frame:** App Launcher · Dev Tools
**YouTube:** [https://youtu.be/0QWB7I5e9Mw](https://youtu.be/0QWB7I5e9Mw)
**Status:** ✅ Published

<div style="position: relative; padding-bottom: 56.25%; height: 0; overflow: hidden; max-width: 100%; margin: 1.5rem 0; border-radius: 8px;">
  <iframe
    src="https://www.youtube-nocookie.com/embed/0QWB7I5e9Mw"
    title="RobOS Model Problem · Dana — Dev Tools setup"
    frameborder="0"
    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
    allowfullscreen
    style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; border-radius: 8px;"></iframe>
</div>

## Story beat

RobOS is configured (video 01). Before Dana can use any AI-powered feature or set up people and groups, she provisions the **toolchain** every developer on the team will share — the IDEs, CLI tools, and cloud SDKs that show up the moment a teammate logs in. Dev Tools is RobOS's package-style installer for developer software: pick what the team needs, it gets staged centrally, and every workspace inherits the same versions.

## Chapters

| Time | Section |
|:----:|:--------|
| 0:00 | Launch Dev Tools from the App Launcher |
| 0:08 | Browse the catalog — IDEs, CLIs, cloud SDKs |
| 0:25 | Install IntelliJ IDEA — one-click, version pinned |
| 0:50 | Install gh, jq, and the AWS CLI |
| 1:15 | Confirm versions appear in the *Installed* tab |
| 1:30 | Mark a tool as *team default* — every group inherits it |
| 1:50 | Quick check: terminal shows the new binaries on `$PATH` |
| 2:10 | Wrap — toolchain ready for the first developer to log in |

## Why this video matters

This is the bridge between the initial RobOS setup (video 01) and the AI-powered steps that follow (Agents, People Manager, Group Manager). Without the CLI tools installed, Dana can't authenticate agents or set up the team. Dev Tools makes the toolchain a configuration artifact, not a tribal-knowledge ritual.

## Deliverables produced by this video

- A populated `~/.config/robos/dev-tools.json` listing the team's pinned tools.
- IntelliJ IDEA, `gh`, `jq`, and AWS CLI installed at known versions, available to every workspace.
- The "team default" flag set, so when Alex (video 08) logs in for the first time, his RobOS workspace already has everything wired up.
