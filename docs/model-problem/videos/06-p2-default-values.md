---
title: "06 — P2 — Default value generator"
parent: Video Production Plan
grand_parent: The Model Problem
layout: default
nav_order: 6
---

# Video 06 — P2 — Default value generator
{: .no_toc }

**Protagonist:** Alex
**Arc:** Engineering
**Target length:** 4:00
**Apps in frame:** AI Agent Manager · Task Board · PR Review · CI Monitor

## Unique to this episode

The hook is *generating sensible defaults without the UI guessing*. Scene highlight: a side-by-side of the old heuristic output and the new descriptor-driven output. Narration calls out scalar, message, repeated, and oneof cases.

## The real engineering work

`protoFieldUtils.ts` replaces the heuristic with a proper generator that consumes the proto descriptors shipped in Video 05. Unit tests cover ApplicationConfiguration, BlobAccessConfiguration, ServerConfiguration.

## Scene list (abbreviated — hero episode shows the full flow)

1. **Pickup** — Alex filters Task Board to the next story, moves to `in_progress`.
2. **AI session** — Claude drafts the implementation using the canned fixture for this story. Focus the camera on *the specific thing this phase is about* (see "Unique" above).
3. **Review** — Jordan's PR Review Board shows the diff, Jordan approves (or requests a targeted change unique to this phase).
4. **Merge + ship** — CI green, package published, Deploy Tracker updates. Quick cut.
5. **Close** — narration underlines what shipped and why it matters for the next episode.

## Blockers / ready-checklist

- [ ] Canned Claude diff for this story under `packages/robos-test/sandbox/data/model-problem/p2-default-values/`.
- [ ] Any phase-specific fixture (e.g. proto descriptors from Video 05) must be in place — don't start recording until the previous episode's artifacts are real.
- [ ] Narration script: draft ~6 cues specific to this phase's story.

## Deliverables produced by this video

- Story merged on `acme-corp/buildbarn-forms`.
- Feature visible in the e2e app when run from a clean clone.
