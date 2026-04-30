---
title: "15 — P7 — Validation pipeline"
parent: Video Production Plan
grand_parent: The Model Problem
layout: default
nav_order: 15
---

# Video 15 — P7 — Validation pipeline
{: .no_toc }

**Protagonist:** Alex ↔ Jordan
**Arc:** Engineering
**Target length:** 5:00
**Apps in frame:** AI Agent Manager · PR Review · CI Monitor

## Unique to this episode

Both Alex and Jordan touch this because validation involves frontend *and* backend. Scene highlight: trying to save a config with a missing required field, seeing the inline red border + banner, fixing it, saving cleanly. Jordan's scene: review round where the validation schema itself needs a subject-matter tweak.

## The real engineering work

Frontend: type + required + format checks against proto descriptors, with per-field red borders and a grouped error banner. Backend (MCP): `jsonnet-lint` + Buildbarn schema validation. Save button disabled until clean. `onValidationError` callback.

## Scene list (abbreviated — hero episode shows the full flow)

1. **Pickup** — Alex filters Task Board to the next story, moves to `in_progress`.
2. **AI session** — Claude drafts the implementation using the canned fixture for this story. Focus the camera on *the specific thing this phase is about* (see "Unique" above).
3. **Review** — Jordan's PR Review Board shows the diff, Jordan approves (or requests a targeted change unique to this phase).
4. **Merge + ship** — CI green, package published, Deploy Tracker updates. Quick cut.
5. **Close** — narration underlines what shipped and why it matters for the next episode.

## Blockers / ready-checklist

- [ ] Canned Claude diff for this story under `packages/robos-test/sandbox/data/model-problem/p7-validation/`.
- [ ] Any phase-specific fixture (e.g. proto descriptors from Video 05) must be in place — don't start recording until the previous episode's artifacts are real.
- [ ] Narration script: draft ~6 cues specific to this phase's story.

## Deliverables produced by this video

- Story merged on `acme-corp/buildbarn-forms`.
- Feature visible in the e2e app when run from a clean clone.
