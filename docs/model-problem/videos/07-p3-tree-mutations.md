---
title: "07 — P3 — Proto-aware tree mutations"
parent: Video Production Plan
grand_parent: The Model Problem
layout: default
nav_order: 7
---

# Video 07 — P3 — Proto-aware tree mutations
{: .no_toc }

**Protagonist:** Alex
**Arc:** Engineering
**Target length:** 5:00
**Apps in frame:** AI Agent Manager · Issue Manager · PR Review · Workspace Manager

## Unique to this episode

First episode where the UI becomes *editable*. Scene highlight: clicking + on a node and watching the field appear in both the tree and the Monaco editor live, with the dirty-state indicator lighting up. Narration emphasizes Immer-backed mutation.

## The real engineering work

Introduces the `useProtoJsonEditor` hook and wires `onAddChild`, `onRemoveChild`, `onChangeOneOf` callbacks. TreeView context menu buttons are enabled. Tested against the e2e app's real-config fixtures.

## Scene list (abbreviated — hero episode shows the full flow)

1. **Pickup** — Alex filters Task Board to the next story, moves to `in_progress`.
2. **AI session** — Claude drafts the implementation using the canned fixture for this story. Focus the camera on *the specific thing this phase is about* (see "Unique" above).
3. **Review** — Jordan's PR Review Board shows the diff, Jordan approves (or requests a targeted change unique to this phase).
4. **Merge + ship** — CI green, package published, Deploy Tracker updates. Quick cut.
5. **Close** — narration underlines what shipped and why it matters for the next episode.

## Blockers / ready-checklist

- [ ] Canned Claude diff for this story under `packages/robos-test/sandbox/data/model-problem/p3-tree-mutations/`.
- [ ] Any phase-specific fixture (e.g. proto descriptors from Video 05) must be in place — don't start recording until the previous episode's artifacts are real.
- [ ] Narration script: draft ~6 cues specific to this phase's story.

## Deliverables produced by this video

- Story merged on `acme-corp/buildbarn-forms`.
- Feature visible in the e2e app when run from a clean clone.
