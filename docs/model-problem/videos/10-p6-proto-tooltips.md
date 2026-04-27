---
title: "10 — P6 — Proto-tooltip integration"
parent: Video Production Plan
grand_parent: The Model Problem
layout: default
nav_order: 10
---

# Video 10 — P6 — Proto-tooltip integration
{: .no_toc }

**Protagonist:** Alex
**Arc:** Engineering
**Target length:** 3:30
**Apps in frame:** AI Agent Manager · PR Review

## Unique to this episode

Every field tooltip now carries real documentation from the proto source, not placeholder text. Scene highlight: hovering four different fields in sequence, each showing its actual proto comment. Narration covers why this is the payoff for Video 05's descriptors.

## The real engineering work

`useProtoComments` hook loads `proto-comments.json` from the proto package and indexes by message+field. Tooltip component wired to it. Covers TreeView nodes and FormFields alike.

## Scene list (abbreviated — hero episode shows the full flow)

1. **Pickup** — Alex filters Task Board to the next story, moves to `in_progress`.
2. **AI session** — Claude drafts the implementation using the canned fixture for this story. Focus the camera on *the specific thing this phase is about* (see "Unique" above).
3. **Review** — Jordan's PR Review Board shows the diff, Jordan approves (or requests a targeted change unique to this phase).
4. **Merge + ship** — CI green, package published, Deploy Tracker updates. Quick cut.
5. **Close** — narration underlines what shipped and why it matters for the next episode.

## Blockers / ready-checklist

- [ ] Canned Claude diff for this story under `packages/robos-test/sandbox/data/model-problem/p6-proto-tooltips/`.
- [ ] Any phase-specific fixture (e.g. proto descriptors from Video 05) must be in place — don't start recording until the previous episode's artifacts are real.
- [ ] Narration script: draft ~6 cues specific to this phase's story.

## Deliverables produced by this video

- Story merged on `acme-corp/buildbarn-forms`.
- Feature visible in the e2e app when run from a clean clone.
