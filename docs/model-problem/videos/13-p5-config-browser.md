---
title: "13 — P5 — ConfigBrowser component"
parent: Video Production Plan
grand_parent: The Model Problem
layout: default
nav_order: 13
---

# Video 13 — P5 — ConfigBrowser component
{: .no_toc }

**Protagonist:** Alex
**Arc:** Engineering
**Target length:** 4:00
**Apps in frame:** AI Agent Manager · PR Review · Stage Demo

## Unique to this episode

A full VS Code–style file tree on the left of the editor. Scene highlight: scrolling the real Buildbarn configs from `e2e/public/tests/real-configs/`, clicking one, watching it load into the JsonnetEditor. Icons, active-row highlight, collapse/expand.

## The real engineering work

`src/ConfigBrowser/ConfigBrowser.tsx` — new component. FontAwesome icons for folders/files, `collections` prop defines the tree shape, `onFileLoad` callback fires when a file is selected. The e2e app is updated to use ConfigBrowser instead of the dropdown selector.

## Scene list (abbreviated — hero episode shows the full flow)

1. **Pickup** — Alex filters Task Board to the next story, moves to `in_progress`.
2. **AI session** — Claude drafts the implementation using the canned fixture for this story. Focus the camera on *the specific thing this phase is about* (see "Unique" above).
3. **Review** — Jordan's PR Review Board shows the diff, Jordan approves (or requests a targeted change unique to this phase).
4. **Merge + ship** — CI green, package published, Deploy Tracker updates. Quick cut.
5. **Close** — narration underlines what shipped and why it matters for the next episode.

## Blockers / ready-checklist

- [ ] Canned Claude diff for this story under `packages/robos-test/sandbox/data/model-problem/p5-config-browser/`.
- [ ] Any phase-specific fixture (e.g. proto descriptors from Video 05) must be in place — don't start recording until the previous episode's artifacts are real.
- [ ] Narration script: draft ~6 cues specific to this phase's story.

## Deliverables produced by this video

- Story merged on `acme-corp/buildbarn-forms`.
- Feature visible in the e2e app when run from a clean clone.
