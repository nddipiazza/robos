---
title: "01 — Dana sets up RobOS for Acme"
parent: Video Production Plan
grand_parent: The Model Problem
layout: default
nav_order: 1
---

# Video 01 — Dana sets up RobOS for Acme
{: .no_toc }

**Protagonist:** Dana (Dev Manager)
**Arc:** Setup
**Target length:** 3:00
**Apps in frame:** Task Servers · Workflow Studio · Git Projects · RobOS Preferences
**YouTube:** [https://youtu.be/jB1YQYEA-jA](https://youtu.be/jB1YQYEA-jA)
**Status:** ✅ Published

<div style="position: relative; padding-bottom: 56.25%; height: 0; overflow: hidden; max-width: 100%; margin: 1.5rem 0; border-radius: 8px;">
  <iframe
    src="https://www.youtube-nocookie.com/embed/jB1YQYEA-jA"
    title="RobOS Model Problem · 01 — Dana sets up RobOS for Acme"
    frameborder="0"
    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
    allowfullscreen
    style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; border-radius: 8px;"></iframe>
</div>

## Table of contents
{: .no_toc .text-delta }

1. TOC
{:toc}

---

## Story beat

Day one at Acme Inc. RobOS is already installed on everyone's machine (we showed that in the install video). Dana is the dev manager and needs to turn a blank RobOS install into a team-ready environment: hook up the task server, design the workflow every ticket will follow, and register the two repos the team will work on.

This video is the "RobOS is configurable, and the manager configures it once" scene. Every other video in the series depends on what Dana does here.

## Pre-seeded state

- Fixture **F1** (`acme-fresh` VM): four Linux users exist but none of them have opened any RobOS apps yet. Dana logs in.
- Fixture **F2** (demo org): `acme-corp/buildbarn-forms` and `acme-corp/buildbarn-forms-proto` forks exist on GitHub; a Jira Cloud instance is live at `acme.atlassian.net` (sandbox tier) with one empty project `BBF`.
- Fixture **F3** (board): the Jira BBF project exists but has zero issues.
- Dana's pass store already contains: `acme/jira-token`, `acme/github-pat`.

## Scene list

1. **Cold open (0:00–0:10)** — Dana logs in at the LightDM screen. RobOS desktop appears, widget panel on the right, empty dashboard middle. Narration: *"Four people, one goal, one fresh RobOS install. Dana goes first."*
2. **Task Servers (0:10–1:00)** — Open Task Servers from the app launcher. Click **Add → Jira Cloud**. Fill name=`Acme Jira`, URL=`https://acme.atlassian.net`, username=`dana@acme.com`. Click **Load from Pass Store** → picks `acme/jira-token`. Click **Test Connection** → success banner. Click **Save**. Narration covers token-from-pass-not-plaintext.
3. **Workflow Studio (1:00–1:50)** — Open Workflow Studio. Empty state. Type into the AI Generate bar: *"agile team shipping a React library, bugs + features + spikes, with a code review gate and staged demo before deploy"*. Click **Generate**. Three types appear with tuned workflows. Expand the **Feature** type, walk through the states (backlog → in_progress → in_review → staged → deployed), point out the AI hook wired on `in_progress`. Click **Save**.
4. **Git Projects (1:50–2:40)** — Open Git Projects. Click **Add Repository** → paste `acme-corp/buildbarn-forms` → RobOS detects it's a React + TypeScript project, suggests a dev-setup script and a test script. Dana accepts the suggestions. Repeat briefly for `buildbarn-forms-proto` (already published, read-only dependency).
5. **Close (2:40–3:00)** — Cut to RobOS Preferences: the acme organization is now on screen with 1 task server, 1 workflow, 2 repos, 4 users. Narration: *"Four minutes of config. The team can start tomorrow."*

## Narration cues

Target ~8 cues, each ≤2 sentences, pacing ~140 WPM with piper.

| # | At | Text (draft) |
|:-:|:-:|:-------------|
| 1 | 0:00 | Four people on one team, one goal: ship a React library for configuring Buildbarn. Dana is the dev manager, and day one is hers. |
| 2 | 0:15 | First stop — Task Servers. RobOS connects to whatever tracker the team uses: Jira, GitHub Issues, Linear, or anything else. |
| 3 | 0:40 | The API token gets loaded from the password store — never pasted, never in a config file. |
| 4 | 1:05 | Workflow Studio is where Dana defines how every ticket moves. She doesn't design by hand — she describes the team in English and lets RobOS draft it. |
| 5 | 1:30 | Three types — Feature, Bug, Spike — each with its own pipeline and AI hooks on the states that matter. |
| 6 | 1:55 | Git Projects registers the two repos the team will work on. RobOS detects the stack and drafts the dev-setup and test scripts. |
| 7 | 2:30 | One for the library, one for the proto types it depends on. Both published to GitHub Packages. |
| 8 | 2:45 | Four minutes of config, one source of truth, every other RobOS app picks it up automatically. Dana hands off. |

## Blockers / ready-checklist

- [ ] Task Servers test-connection needs to succeed against a real (sandbox) Jira — or we mock it. Decide before recording.
- [ ] Workflow Studio AI Generate must return the exact three types consistently — our existing canned response in `workflows-generated.json` needs a second fixture for this series (feature/bug/spike instead of the current bug/feature/spike).
- [ ] Git Projects' dev-setup script generator must produce something plausible for a React + TypeScript monorepo. Test with real buildbarn-forms source before recording.
- [ ] Pre-create `acme/jira-token` entry in Dana's pass store (empty-string contents is fine; UI just needs a selectable entry).

## Deliverables produced by this video

- `~/.config/robos/settings.json` for the whole team, seeded with task server + workflows + repos. **This file becomes fixture F3 for video 02.**
- A YouTube video embedded on the home-page hero (replaces the current install video? — decide).
- An entry in the status board.
