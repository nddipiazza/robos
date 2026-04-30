---
title: "07 — Jordan wires up CI/CD + npm publishing"
parent: Video Production Plan
grand_parent: The Model Problem
layout: default
nav_order: 7
---

# Video 07 — Jordan wires up CI/CD + npm publishing
{: .no_toc }

**Protagonist:** Jordan (Dev Lead)
**Arc:** Setup
**Target length:** 2:30
**Apps in frame:** Git Projects · Pass Manager · CI Monitor · Automation Studio

## Story beat

Jordan's the dev lead — cares about how code gets merged, tested, and shipped. Before anyone writes code, Jordan stands up the pipeline: GitHub Actions for test/lint/build, an npm publish job on tag, Chromatic for visual regression, and a RobOS automation rule that triggers a stage-demo on every merge. One sitting, everything future PRs will rely on.

## Pre-seeded state

- Task Server configured (from Video 01), backlog populated (from Video 02).
- The `acme-corp/buildbarn-forms` fork has the ad417f7 commit history but no `.github/workflows/` yet (or has placeholders we replace).
- `acme/npm-publish-token` + `acme/chromatic-token` are in Jordan's pass store.

## Scene list

1. **Git Projects (0:00–0:30)** — Jordan opens the `buildbarn-forms` project. Clicks on the "CI/CD" tab. Empty state.
2. **Authoring the workflow (0:30–1:15)** — Uses the `ci.yml` template RobOS suggests. Modifies to add: `npm test`, `npm run lint`, `npm run build`, Playwright job, Chromatic publish job. Secrets mapped from Pass Manager via a dropdown. Save → RobOS commits `.github/workflows/ci.yml` + `publish.yml` to a setup branch and opens a PR.
3. **CI Monitor (1:15–1:45)** — Jordan approves + merges the setup PR. CI Monitor shows the first run of the new pipeline executing, green ✓ for each job.
4. **Automation Studio (1:45–2:20)** — Jordan opens Automation Studio → New Rule → event `pr.merged`, condition `repo = buildbarn-forms`, action `run stage-demo generator + post #eng-ship + advance linked issue to "staged"`. Save rule.
5. **Close (2:20–2:30)** — Dashboard shows the rule active, CI green, pipeline ready. Narration: *"Now anything Alex merges flows through the same pipe, the same checks, the same notifications."*

## Narration cues (draft)

| # | At | Text |
|:-:|:-:|:-----|
| 1 | 0:00 | Jordan's the dev lead. Before anyone writes code, the pipeline gets wired up. |
| 2 | 0:20 | Git Projects generates a CI workflow template — Jordan tweaks it for the library's stack. |
| 3 | 0:50 | Every secret the workflow needs maps to a Pass Manager entry. Nothing in plain text. |
| 4 | 1:20 | First run of the new pipeline. Test, lint, build, Playwright, Chromatic — all green. |
| 5 | 1:50 | Automation Studio adds the rule every PR will trigger: stage-demo on merge, notify the channel, advance the linked issue. |
| 6 | 2:25 | Pipeline is live. Every story from here on ships through the same path. |

## Blockers / ready-checklist

- [ ] Git Projects' "CI/CD" tab + `ci.yml` template generator — verify this is a real feature in v0.0.5 (may need to build or stub).
- [ ] We don't actually want to trigger Chromatic bills — point Chromatic token at a dead project or stub the publish-job in fake CI.
- [ ] Automation Studio's `pr.merged` trigger + `advance linked issue` action — verify the exact event name and check that the rule editor exposes these action types.

## Deliverables produced by this video

- `.github/workflows/ci.yml` + `publish.yml` in `acme-corp/buildbarn-forms`.
- Automation Studio rule set persisted to `~/.config/robos/event-rules.json`.
- First green CI run visible in CI Monitor — used as fixture for video 05's "existing green build" cold open.
