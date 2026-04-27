---
title: "14 — P10 — Performance + polish, 1.0.0 release"
parent: Video Production Plan
grand_parent: The Model Problem
layout: default
nav_order: 14
---

# Video 14 — P10 — Performance + polish, 1.0.0 release
{: .no_toc }

**Protagonist:** Alex
**Arc:** Engineering
**Target length:** 5:00
**Apps in frame:** AI Agent Manager · CI Monitor · Deploy Tracker · Notifications

## Unique to this episode

The victory lap. Scene highlight: loading a 50MB real Buildbarn config, watching the virtualized tree render in under a second, toggling dark mode, using Ctrl+S to save, and finally tagging `v1.0.0` in Git Projects — publish job kicks off, `@hermetiq/buildbarn-forms@1.0.0` lands in the registry. Final Deploy Tracker entry.

## The real engineering work

Tree virtualization for large arrays, lazy-load of proto metadata, dark-mode toggle, keyboard shortcuts (Ctrl+S, Ctrl+K), a11y sweep to WCAG 2.1 AA, performance benchmarks. Version bumped to 1.0.0 and published.

## Scene list (abbreviated — hero episode shows the full flow)

1. **Pickup** — Alex filters Task Board to the next story, moves to `in_progress`.
2. **AI session** — Claude drafts the implementation using the canned fixture for this story. Focus the camera on *the specific thing this phase is about* (see "Unique" above).
3. **Review** — Jordan's PR Review Board shows the diff, Jordan approves (or requests a targeted change unique to this phase).
4. **Merge + ship** — CI green, package published, Deploy Tracker updates. Quick cut.
5. **Close** — narration underlines what shipped and why it matters for the next episode.

## Blockers / ready-checklist

- [ ] Canned Claude diff for this story under `packages/robos-test/sandbox/data/model-problem/p10-polish/`.
- [ ] Any phase-specific fixture (e.g. proto descriptors from Video 05) must be in place — don't start recording until the previous episode's artifacts are real.
- [ ] Narration script: draft ~6 cues specific to this phase's story.

## Deliverables produced by this video

- Story merged on `acme-corp/buildbarn-forms`.
- Feature visible in the e2e app when run from a clean clone.
