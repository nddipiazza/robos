---
title: Video Production Plan
parent: The Model Problem
layout: default
nav_order: 100
has_children: true
---

# Model Problem — Video Production Plan
{: .no_toc }

We prove RobOS can solve a real engineering problem by recording the team (Dana, Pat, Jordan, Alex) actually finishing the `@hermetiq/buildbarn-forms` React library — from rough draft to shipped npm package — and publishing the whole journey as a YouTube series.
{: .fs-6 .fw-300 }

## Table of contents
{: .no_toc .text-delta }

1. TOC
{:toc}

---

## Scope

**What we're building:** the second half of `@hermetiq/buildbarn-forms` — a React component library that renders any Buildbarn configuration as a Monaco editor plus an interactive proto-typed tree view. The `buildbarn-forms-proto` package is already shipped; the forms package is mid-refactor from a form-based approach to a Monaco + tree approach. Ten concrete engineering phases remain, sourced from the knowledge graph at `~/source/hermetiq/hermetiq-genai-agent` and the draft repo at `~/source/hermetiq/buildbarn-forms`.

**What we're recording:** a 20-episode series showing every phase of the work inside RobOS, with the four role accounts (Dana / Pat / Jordan / Alex) logging in as separate Linux users on the same v0.0.5 VM. Each episode is one sitting, one protagonist, one piece of work.

**End state:** by video 20, buildbarn-forms is merged, published as `@hermetiq/buildbarn-forms@1.0.0` on GitHub Packages, Storybook is live, and every engineering phase has a YouTube link you can point at.

---

## The engineering phases

Pulled from the scouting pass on the three reference repos. Each phase is an independently-shippable feature and a video-worth of content.

| # | Phase | What gets built | Repo touched |
|:-:|:------|:----------------|:-------------|
| P1 | Proto Field Metadata API | Runtime descriptors (`dist/proto-descriptors.json`) exposing every message + field in Buildbarn's config protos, plus a `getMessageFieldsMetadata()` helper. | buildbarn-forms-proto |
| P2 | Default Value Generator | `generateDefaultValue(fieldMetadata)` — proper defaults for scalar/message/repeated/oneof fields. | buildbarn-forms |
| P3 | Proto-Aware Tree Mutations | `useProtoJsonEditor` hook + context-menu wiring. Add / remove / edit / switch-oneof actions that actually mutate the JSON tree live. | buildbarn-forms |
| P4 | MCP HTTP Integration | `mcpClient.ts` — tree mutations round-trip through the MCP server via POST calls, with an error banner + local-fallback mode. | buildbarn-forms |
| P5 | ConfigBrowser Component | VS Code–style file tree on the left, JsonnetEditor on the right. Replaces the dropdown selectors in the e2e app. | buildbarn-forms |
| P6 | Proto-Tooltip Integration | Hook that pulls `proto-comments.json` and auto-populates every field tooltip with the proto-level doc comment. | buildbarn-forms |
| P7 | Validation Pipeline | Frontend type-checks + required-field checks + backend jsonnet-lint + Buildbarn schema validation. Save button disabled until clean. | buildbarn-forms + MCP |
| P8 | Storybook Component Library | Stories for every public component, published to GitHub Pages + visual-regression via Chromatic. | buildbarn-forms |
| P9 | E2E Test Hardening | Playwright coverage up to 80%+, visual snapshots, zero flakes, every PR gates on it. | buildbarn-forms |
| P10 | Performance + Polish | Virtualized tree, lazy-load proto metadata, dark mode, keyboard shortcuts, a11y pass. Release as 1.0.0. | buildbarn-forms |

---

## The 20-episode series

Each row links to the per-video doc in [`videos/`](videos/) where we track script, fixtures, and production status.

| # | Video | Protagonist | Arc | Length | Apps in frame |
|:-:|:------|:------------|:----|:------:|:--------------|
| [01](videos/01-dana-setup.md) | Dana sets up RobOS for Acme | Dana | Setup | 3:00 | Task Servers, Workflow Studio, Git Projects, RobOS Preferences |
| [02](videos/02-dana-robos-agents.md) | Dana configures RobOS Agents (login, sessions, default agent) | Dana | Setup | 3:06 | App Launcher, Agents Manager |
| [03](videos/03-dana-people-manager.md) | Dana sets up People Manager | Dana | Setup | 1:58 | App Launcher, People Manager |
| [04](videos/04-dana-group-manager.md) | Dana sets up Group Manager | Dana | Setup | 3:08 | App Launcher, Group Manager |
| [05](videos/05-dana-dev-tools.md) | Dana installs the team toolchain | Dana | Setup | 2:30 | App Launcher, Dev Tools |
| [06](videos/06-pat-epic-breakdown.md) | Pat breaks the rewrite into 10 stories | Pat | Setup | 2:30 | Issue Manager, Context Manager, Workflow Studio |
| [07](videos/07-jordan-ci-setup.md) | Jordan wires up CI/CD + npm publishing | Jordan | Setup | 2:30 | Git Projects, Pass Manager, CI Monitor, Automation Studio |
| [08](videos/08-alex-onboarding.md) | Alex's first day on the project | Alex | Setup | 3:00 | Security Setup, Pass Manager, Dev Tools, Git Projects, Workspace Manager |
| [09](videos/09-p1-proto-metadata.md) | **P1 — Proto Metadata API** (*hero episode, full flow*) | Alex ↔ Jordan ↔ automated | Engineering | 6:00 | AI Agent Manager, Task Board, Issue Manager, PR Review, CI Monitor, Deploy Tracker, Notifications |
| [10](videos/10-p2-default-values.md) | P2 — Default value generator | Alex | Engineering | 4:00 | Task Board, AI Agent Manager, PR Review |
| [11](videos/11-p3-tree-mutations.md) | P3 — Proto-aware tree mutations | Alex | Engineering | 5:00 | AI Agent Manager, Issue Manager, PR Review |
| [12](videos/12-p4-mcp-integration.md) | P4 — MCP HTTP integration | Alex | Engineering | 5:00 | AI Agent Manager, Context Manager, CI Monitor |
| [13](videos/13-p5-config-browser.md) | P5 — ConfigBrowser component | Alex | Engineering | 4:00 | AI Agent Manager, PR Review, Stage Demo |
| [14](videos/14-p6-proto-tooltips.md) | P6 — Proto-tooltip integration | Alex | Engineering | 3:30 | AI Agent Manager, PR Review |
| [15](videos/15-p7-validation.md) | P7 — Validation pipeline | Alex ↔ Jordan | Engineering | 5:00 | AI Agent Manager, PR Review, CI Monitor |
| [16](videos/16-p8-storybook.md) | P8 — Storybook component library | Alex | Engineering | 4:00 | AI Agent Manager, Deploy Tracker, Stage Demo |
| [17](videos/17-p9-e2e-hardening.md) | P9 — E2E test hardening | Jordan | Engineering | 4:00 | AI Agent Manager, CI Monitor, Automation Studio |
| [18](videos/18-p10-polish.md) | P10 — Performance + polish, 1.0.0 release | Alex | Engineering | 5:00 | AI Agent Manager, CI Monitor, Deploy Tracker, Notifications |
| [19](videos/19-retrospective.md) | Sprint retrospective — what shipped, what it means | All four (dashboards tour) | Wrap | 4:00 | Manager Dashboard, Dev Central, Report Builder, Stage Demo |
| [20](videos/20-master-cut.md) | **Master cut** — "How four people shipped a React library on RobOS" | Narrated compilation | Wrap | 12:00 | Clips from 01–19 |

**Total production target:** ~80 minutes across 19 episodes + 12-minute master cut = ~92 minutes of watchable content.

---

## Production model

### Locked decisions

These are committed. Don't re-debate during production.

| # | Decision | Choice | Concrete pointer |
|:-:|:---------|:-------|:-----------------|
| A | Task server | **Atlassian Jira (free plan)** | `https://robos-acme.atlassian.net/` · project key `KAN` · API token in pass store under `robos-acme-inc/jira-token` |
| B | Source repos | **Real public repos in nddipiazza personal space** | `https://github.com/nddipiazza/buildbarn-forms` · `https://github.com/nddipiazza/buildbarn-forms-proto` |
| C | AI providers | **GitHub Copilot + Claude Code** (no OpenAI in this iteration) | Both detected by AI Agent Manager. OpenAI lands in a future iteration. |
| D | Linux users | **Four real users via cloud-init** | `dana`, `pat`, `jordan`, `alex` on the same v0.0.5 VM. See [`fixtures.md`](fixtures.md#f1) for the cloud-init patch. |
| E | Recording method | **`ffmpeg x11grab` against the QEMU gtk display** | Same pipeline as the install video. Full screen, 30 fps, VP9. |
| F | Narration pipeline | **Piper `en_US-lessac-medium` + the existing `narrator.js`** | See [`handoff.md`](handoff.md#narration) for the exact command. |
| G | Final container + codecs | **mp4 — h264 video copy + aac audio + mov_text captions** | Matches the `robos-install-narrate.js` driver we already use. |

### How a typical episode is produced

1. Confirm fixtures exist (see [`fixtures.md`](fixtures.md)).
2. Boot the VM. SSH in if you need to seed extra state.
3. Log in as the protagonist user at LightDM.
4. Start `ffmpeg x11grab` recording (see [`handoff.md`](handoff.md#recording)).
5. Walk through the scene list from the per-video doc.
6. Stop the recording. Trim raw footage in your editor.
7. Run the narration generator with the cue table from the per-video doc.
8. Mux + caption + write the per-video YouTube `.md` from [`metadata-template.md`](metadata-template.md).
9. Upload. Update the status board below. Embed in the docs.

The full step-by-step is in [`handoff.md`](handoff.md). Anyone — human, Copilot, Claude, future-you — should be able to run an episode start-to-finish from that runbook without asking questions.

---

## Fixtures

Every fixture has a fully-specified build procedure in [`fixtures.md`](fixtures.md). Summary table below; consult that doc for actual commands and JSON schemas.

| Order | Fixture | Content (one line) | First used in | Build procedure |
|:-----:|:--------|:-------------------|:--------------|:----------------|
| F1 | `acme-fresh` VM snapshot | v0.0.5 qcow2 with cloud-init seeded for dana/pat/jordan/alex | 01 | [F1](fixtures.md#f1-acme-fresh-vm-snapshot) |
| F2 | GitHub repos | `nddipiazza/buildbarn-forms` + `nddipiazza/buildbarn-forms-proto` public + GH PATs in pass | 01 | [F2](fixtures.md#f2-github-repos) |
| F3 | Jira project | `https://robos-acme.atlassian.net/` project KAN with workflow + types | 01 | [F3](fixtures.md#f3-jira-project) |
| F4 | Epic `KAN-0` + stories `KAN-1..KAN-10` | One story per engineering phase, authored by Pat | 06 | [F4](fixtures.md#f4-epic--stories) |
| F5 | `buildbarn-forms` worktree at base commit | The rough-draft state Alex picks up | 08 | [F5](fixtures.md#f5-buildbarn-forms-worktree) |
| F6 | Local Verdaccio with `@hermetiq/buildbarn-forms-proto` published | Lets `npm install` resolve without hitting prod GitHub Packages | 08 | [F6](fixtures.md#f6-local-verdaccio) |
| F7 | Per-phase Claude prompts + canned diffs | Deterministic AI output so retakes match | 09 | [F7](fixtures.md#f7-canned-ai-output) |
| F8 | CI + deploy mock | Stubbed `gh run list` / deploy events for the post-merge flow | 09 | [F8](fixtures.md#f8-ci--deploy-mock) |

F1–F4 block episode 01. F5–F6 block episode 08. F7–F8 block episode 09 onward.

---

## Narration style

Same voice we used for the app demos. Piper `en_US-lessac-medium`, ~140 WPM, em-dashes for secondary clauses, short cues (≤2 sentences), first mention of an app capitalized then lowercase, never "the platform" — always "RobOS".

Engineering-specific additions:
- When reading code on screen, narration should name the file and summarize the change in one sentence, not read the code verbatim.
- When an AI agent is producing output, narration explains what it's being asked for and what it produced; the viewer watches the stream.
- When a PR is under review, narration walks through Jordan's reasoning, not Alex's.

---

## Status board

| # | Video | Fixtures ready | Script drafted | Recorded | Published | YouTube URL |
|:-:|:------|:-:|:-:|:-:|:-:|:-----------:|
| 01 | Dana sets up RobOS              | ✅ | ✅ | ✅ | ✅ | [jB1YQYEA-jA](https://youtu.be/jB1YQYEA-jA) |
| 01a | Dana — Task Servers (deep-dive) | ✅ | ✅ | ✅ | ✅ | [vygBUoocpbg](https://youtu.be/vygBUoocpbg) |
| 01b | Dana — Workflow Studio (deep-dive) | ✅ | ✅ | ✅ | ✅ | [FzUQs7tWkOo](https://youtu.be/FzUQs7tWkOo) |
| 02 | Dana — RobOS Agents             | ✅ | ✅ | ✅ | ✅ | [ZubntVBA6Pw](https://youtu.be/ZubntVBA6Pw) |
| 03 | Dana — People Manager           | ✅ | ✅ | ✅ | ✅ | [ZdvQwFQwwbg](https://youtu.be/ZdvQwFQwwbg) |
| 04 | Dana — Group Manager            | ✅ | ✅ | ✅ | ✅ | [mxnPjiJ0G8I](https://youtu.be/mxnPjiJ0G8I) |
| 05 | Dana — Dev Tools                | ✅ | ✅ | ✅ | ✅ | [0QWB7I5e9Mw](https://youtu.be/0QWB7I5e9Mw) |
| 06 | Pat breaks down the rewrite     | ⬜ | ⬜ | ⬜ | ⬜ | — |
| 07 | Jordan wires up CI/CD           | ⬜ | ⬜ | ⬜ | ⬜ | — |
| 08 | Alex's first day                | ⬜ | ⬜ | ⬜ | ⬜ | — |
| 09 | P1 — Proto Metadata (hero)      | ⬜ | ⬜ | ⬜ | ⬜ | — |
| 10 | P2 — Default values             | ⬜ | ⬜ | ⬜ | ⬜ | — |
| 11 | P3 — Tree mutations             | ⬜ | ⬜ | ⬜ | ⬜ | — |
| 12 | P4 — MCP integration            | ⬜ | ⬜ | ⬜ | ⬜ | — |
| 13 | P5 — ConfigBrowser              | ⬜ | ⬜ | ⬜ | ⬜ | — |
| 14 | P6 — Proto tooltips             | ⬜ | ⬜ | ⬜ | ⬜ | — |
| 15 | P7 — Validation                 | ⬜ | ⬜ | ⬜ | ⬜ | — |
| 16 | P8 — Storybook                  | ⬜ | ⬜ | ⬜ | ⬜ | — |
| 17 | P9 — E2E hardening              | ⬜ | ⬜ | ⬜ | ⬜ | — |
| 18 | P10 — Polish + 1.0.0            | ⬜ | ⬜ | ⬜ | ⬜ | — |
| 19 | Retrospective                   | ⬜ | ⬜ | ⬜ | ⬜ | — |
| 20 | Master cut                      | ⬜ | ⬜ | ⬜ | ⬜ | — |

---

## What to do next

The work is fully spec'd. Run the steps in order — each one points at the doc that holds the actual commands.

1. **[Read `handoff.md`](handoff.md).** It's the operations runbook. Every step in the rest of this list lives there as a numbered procedure.
2. **Build fixtures F1–F4** following [`fixtures.md`](fixtures.md). These block Video 01.
3. **Record Video 01** using [`videos/01-dana-setup.md`](videos/01-dana-setup.md) (scene-by-scene script) and the recording procedure in [`handoff.md`](handoff.md#recording).
4. **Generate narration** with the command in [`handoff.md`](handoff.md#narration).
5. **Write the YouTube `.md`** by copying [`metadata-template.md`](metadata-template.md) and filling in the Video 01 specifics.
6. **Upload** following [`handoff.md`](handoff.md#upload). Update the status board above.
7. **Move to Video 06.** Same loop: fixtures (F4 if not yet built) → record → narrate → metadata → upload → tick. (Videos 02–05 are already published; the engineering arc starts at 06.)

The other 14 per-video docs under [`videos/`](videos/) are seeded with scene outline and app inventory; their narration scripts get fleshed out just-in-time as we approach each recording.

## Reference index

- [`handoff.md`](handoff.md) — operations runbook (read this first).
- [`fixtures.md`](fixtures.md) — F1–F8 build procedures.
- [`metadata-template.md`](metadata-template.md) — YouTube `.md` template + chapter generator usage.
- [`videos/`](videos/) — per-episode scene scripts and cue lists.
