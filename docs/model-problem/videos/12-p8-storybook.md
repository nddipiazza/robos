---
title: "12 — P8 — Storybook component library"
parent: Video Production Plan
grand_parent: The Model Problem
layout: default
nav_order: 12
---

# Video 12 — P8 — Storybook component library
{: .no_toc }

**Protagonist:** Alex
**Arc:** Engineering
**Target length:** 4:00
**Apps in frame:** AI Agent Manager · Deploy Tracker · Stage Demo

## Unique to this episode

The moment buildbarn-forms becomes *reusable*. Scene highlight: navigating the deployed Storybook on GitHub Pages, playing with JsonnetEditor and ConfigBrowser knobs live, viewing the auto-generated visual diffs from Chromatic. Narration pitches this as the 'component library maturity' beat.

## The real engineering work

Stories for JsonnetEditor, TreeView, TreeNode, ConfigBrowser, Tooltip. Storybook deployed to GitHub Pages. Chromatic wired in for visual regression.

## Scene list (abbreviated — hero episode shows the full flow)

1. **Pickup** — Alex filters Task Board to the next story, moves to `in_progress`.
2. **AI session** — Claude drafts the implementation using the canned fixture for this story. Focus the camera on *the specific thing this phase is about* (see "Unique" above).
3. **Review** — Jordan's PR Review Board shows the diff, Jordan approves (or requests a targeted change unique to this phase).
4. **Merge + ship** — CI green, package published, Deploy Tracker updates. Quick cut.
5. **Close** — narration underlines what shipped and why it matters for the next episode.

## Blockers / ready-checklist

- [ ] Canned Claude diff for this story under `packages/robos-test/sandbox/data/model-problem/p8-storybook/`.
- [ ] Any phase-specific fixture (e.g. proto descriptors from Video 05) must be in place — don't start recording until the previous episode's artifacts are real.
- [ ] Narration script: draft ~6 cues specific to this phase's story.

## Deliverables produced by this video

- Story merged on `acme-corp/buildbarn-forms`.
- Feature visible in the e2e app when run from a clean clone.
