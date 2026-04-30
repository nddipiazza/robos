---
title: "20 — Master cut — how four people shipped a React library on RobOS"
parent: Video Production Plan
grand_parent: The Model Problem
layout: default
nav_order: 20
---

# Video 20 — Master cut — how four people shipped a React library on RobOS
{: .no_toc }

**Protagonist:** Narrated compilation
**Arc:** Engineering
**Target length:** 12:00
**Apps in frame:** Clips from episodes 01–15

## Unique to this episode

The feature video we pin on the channel. Cold open with the problem statement, 30-second trailers for each arc, landing shots of the shipped library. This is the one we put on the home page.

## The real engineering work

No new engineering. Pure post-production: cut the best 30–60 seconds from each of the previous 15 episodes, rerecord fresh narration over the transitions, end card with subscribe + per-episode links.

## Scene list (abbreviated — hero episode shows the full flow)

1. **Pickup** — Alex filters Task Board to the next story, moves to `in_progress`.
2. **AI session** — Claude drafts the implementation using the canned fixture for this story. Focus the camera on *the specific thing this phase is about* (see "Unique" above).
3. **Review** — Jordan's PR Review Board shows the diff, Jordan approves (or requests a targeted change unique to this phase).
4. **Merge + ship** — CI green, package published, Deploy Tracker updates. Quick cut.
5. **Close** — narration underlines what shipped and why it matters for the next episode.

## Blockers / ready-checklist

- [ ] Canned Claude diff for this story under `packages/robos-test/sandbox/data/model-problem/master-cut/`.
- [ ] Any phase-specific fixture (e.g. proto descriptors from Video 05) must be in place — don't start recording until the previous episode's artifacts are real.
- [ ] Narration script: draft ~6 cues specific to this phase's story.

## Deliverables produced by this video

- Story merged on `acme-corp/buildbarn-forms`.
- Feature visible in the e2e app when run from a clean clone.
