---
title: "15 — Sprint retrospective — what shipped, what it means"
parent: Video Production Plan
grand_parent: The Model Problem
layout: default
nav_order: 15
---

# Video 15 — Sprint retrospective — what shipped, what it means
{: .no_toc }

**Protagonist:** All four (dashboards tour)
**Arc:** Engineering
**Target length:** 4:00
**Apps in frame:** Manager Dashboard · Dev Central · Report Builder · Stage Demo

## Unique to this episode

Four-way dashboard tour. Each role gets ~45s showing what the sprint looked like from their vantage point, with Report Builder producing the retrospective write-up live. No new engineering.

## The real engineering work

No code. Each dashboard view is already covered by the earlier app demos (videos 07–17 of the app series); this episode just assembles them into the specific sprint narrative for buildbarn-forms.

## Scene list (abbreviated — hero episode shows the full flow)

1. **Pickup** — Alex filters Task Board to the next story, moves to `in_progress`.
2. **AI session** — Claude drafts the implementation using the canned fixture for this story. Focus the camera on *the specific thing this phase is about* (see "Unique" above).
3. **Review** — Jordan's PR Review Board shows the diff, Jordan approves (or requests a targeted change unique to this phase).
4. **Merge + ship** — CI green, package published, Deploy Tracker updates. Quick cut.
5. **Close** — narration underlines what shipped and why it matters for the next episode.

## Blockers / ready-checklist

- [ ] Canned Claude diff for this story under `packages/robos-test/sandbox/data/model-problem/retrospective/`.
- [ ] Any phase-specific fixture (e.g. proto descriptors from Video 05) must be in place — don't start recording until the previous episode's artifacts are real.
- [ ] Narration script: draft ~6 cues specific to this phase's story.

## Deliverables produced by this video

- Story merged on `acme-corp/buildbarn-forms`.
- Feature visible in the e2e app when run from a clean clone.
