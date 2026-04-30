---
title: "17 — P9 — E2E test hardening"
parent: Video Production Plan
grand_parent: The Model Problem
layout: default
nav_order: 17
---

# Video 17 — P9 — E2E test hardening
{: .no_toc }

**Protagonist:** Jordan
**Arc:** Engineering
**Target length:** 4:00
**Apps in frame:** AI Agent Manager · CI Monitor · Automation Studio

## Unique to this episode

Jordan's episode — the dev lead cares most about test stability. Scene highlight: CI Monitor showing the green streak across 20 recent runs, the visual regression report from the hardened Playwright suite, and the Automation Studio rule that blocks PR merge if e2e fails.

## The real engineering work

Playwright coverage expanded to add/remove/edit/oneof, validation errors, MCP flows. Visual snapshots captured via monocart reporter. Flake fixes (deterministic waits, network mocks). CI gate rule added in Automation Studio.

## Scene list (abbreviated — hero episode shows the full flow)

1. **Pickup** — Alex filters Task Board to the next story, moves to `in_progress`.
2. **AI session** — Claude drafts the implementation using the canned fixture for this story. Focus the camera on *the specific thing this phase is about* (see "Unique" above).
3. **Review** — Jordan's PR Review Board shows the diff, Jordan approves (or requests a targeted change unique to this phase).
4. **Merge + ship** — CI green, package published, Deploy Tracker updates. Quick cut.
5. **Close** — narration underlines what shipped and why it matters for the next episode.

## Blockers / ready-checklist

- [ ] Canned Claude diff for this story under `packages/robos-test/sandbox/data/model-problem/p9-e2e-hardening/`.
- [ ] Any phase-specific fixture (e.g. proto descriptors from Video 05) must be in place — don't start recording until the previous episode's artifacts are real.
- [ ] Narration script: draft ~6 cues specific to this phase's story.

## Deliverables produced by this video

- Story merged on `acme-corp/buildbarn-forms`.
- Feature visible in the e2e app when run from a clean clone.
