---
title: "05 — P1: Proto Metadata API (hero episode)"
parent: Video Production Plan
grand_parent: The Model Problem
layout: default
nav_order: 5
---

# Video 05 — P1: Proto Metadata API
{: .no_toc }

**Protagonist:** Alex (implementer) → Jordan (reviewer) → automated pipeline
**Arc:** Engineering (hero episode — full flow)
**Target length:** 6:00
**Apps in frame:** AI Agent Manager · Task Board · Issue Manager · Workspace Manager · PR Review · CI Monitor · Deploy Tracker · Notifications

## Why this is the hero episode

This is the single episode that shows the entire RobOS development loop end-to-end on one real story. Every subsequent engineering episode abbreviates the flow — because viewers have already seen it here — and focuses on what's unique about *that* phase. The flow shown in this video is the thing RobOS is selling: pick up → AI drafts → human reviews → AI answers questions → PR opens → reviewer reviews → merge → deploy → demo → dashboards update. All inside RobOS. No terminal tabs, no context switches, no browser.

## The real engineering work

Story `BBF-1` — in `buildbarn-forms-proto`:

1. Extend `scripts/generate-protos.sh` to also output a `buf build --output descriptors.pbbin` descriptor set.
2. Write `scripts/extract-descriptors.ts` that reads the `.pbbin`, walks every message and field, and emits `dist/proto-descriptors.json` with shape `{ [messageName]: { fields: [{ name, protoType, cardinality, oneof?, map? }, ...] } }`.
3. Update `package.json` scripts so `npm run build` produces both `proto-comments.json` and `proto-descriptors.json`.
4. Add a Node-level test that round-trips one well-known message (`ApplicationConfiguration`) and asserts key fields are present.
5. Open PR, review, merge. Deploy to the VM's local Verdaccio as `@hermetiq/buildbarn-forms-proto@0.2.5`.

## Scene list (longer than usual because this is the hero)

### Act 1 — Pickup (0:00–0:45)

1. Alex's **Task Board**. Filter to assignee=@me → empty. Filter off → the 10 backlog stories. Alex clicks BBF-1.
2. **Issue Manager** opens: story title, acceptance criteria, the "Proto Field Metadata API" description Pat drafted. State chip `backlog`.
3. Alex clicks **Start Work** → transition button in the sidebar → state moves to `in_progress`. Automation Studio rule fires in the background (visible briefly as a toast).

### Act 2 — AI pair-coding (0:45–3:00)

4. **AI Agent Manager** auto-opens as part of the "start work" flow (because the workflow Dana defined has `on_enter_prompt` on the `in_progress` state).
5. Claude starts a new session in the buildbarn-forms-proto workspace, primed with the issue body + the knowledge graph source. Narration explains the context plumbing.
6. Claude asks the AI Questionnaire: *"Use buf descriptor set, custom AST walker, or protobuf-descriptors crate? I recommend buf because you already use it."* Alex picks buf.
7. Claude streams a plan, then the diff. `generate-protos.sh` updated, `extract-descriptors.ts` created, `package.json` script wired.
8. Alex scrolls the diff in the human-review panel. Accepts 3 of 4 hunks; rewrites one line by hand (narration: *"The human is still in the loop"*).
9. AI Quiz fires: *"Explain what `oneof` cardinality in the descriptors file represents."* Alex types an answer. Green check.

### Act 3 — PR (3:00–3:45)

10. **Create PR** button. Title + body are drafted from the questionnaire answers + diff. Opens on GitHub (mocked).
11. **Task Board** view — Alex's card moves to `in_review`.
12. Notification toast on Jordan's side of the screen split (we cut to Jordan's desktop): *"Review requested on PR #3"*.

### Act 4 — Review (3:45–4:45)

13. Cut to **Jordan's desktop**. Jordan clicks the notification. **PR Review Board** opens on PR #3.
14. AI Review tab → **Generate Summary**. Risk: low. Coverage: good. One concrete suggestion: "consider pinning `buf` version in the script". Jordan agrees, leaves an inline comment, clicks **Request Changes**.
15. Cut back to **Alex**. Toast fires: *"Changes requested on PR #3"*.
16. Alex opens the PR. Pins the buf version as Jordan asked. Pushes. CI runs green again. Jordan's PR Review Board auto-refreshes. Jordan **Approves**.

### Act 5 — Merge + ship (4:45–6:00)

17. Alex clicks **Merge**. Automation Studio rule fires: **CI Monitor** lights up with the build + publish runs → green.
18. **Deploy Tracker** appends an entry: `@hermetiq/buildbarn-forms-proto@0.2.5 → verdaccio-local`.
19. **Stage Demo Viewer** auto-generates a walkthrough of the BBF-1 diff.
20. **Notifications** fire for Pat ("Stage demo ready") and Dana ("Story shipped").
21. Final beat: cut to **Manager Dashboard** — velocity chart ticks up by one story, BBF-1 moves to "Deployed" in the sprint board.

## Narration (fuller draft — this episode deserves tight writing)

| # | At | Text |
|:-:|:-:|:-----|
| 1 | 0:00 | Alex picks up the first story off the backlog — the proto metadata API. This is the episode that shows the whole RobOS loop end-to-end. Every episode after this one is a variation on what you're about to see. |
| 2 | 0:30 | Moving the ticket to In Progress fires a workflow rule that Dana wired up in episode one: it opens a Claude session with the story context already loaded. |
| 3 | 1:00 | The AI Questionnaire is the first moment of human judgment. Claude proposes three implementation approaches. Alex picks one, and that choice shapes everything that follows. |
| 4 | 1:30 | Claude drafts the diff. Alex doesn't accept it blindly — every hunk gets reviewed, some get rewritten by hand. |
| 5 | 2:15 | After the draft, the AI Quiz checks that Alex actually understands what just got written. It's not a gate, it's a forcing function against blind acceptance. |
| 6 | 3:00 | Create PR. Title and body are drafted from the questionnaire answers plus the final diff — no "fix stuff" commit messages. |
| 7 | 3:30 | Jordan gets the review notification on the other side of the screen. |
| 8 | 3:45 | AI Review summarizes the diff. Low risk, good coverage, one suggestion. Jordan agrees, leaves an inline comment, requests changes. |
| 9 | 4:15 | Alex sees the request, fixes the comment, pushes. CI runs green. Jordan approves. |
| 10 | 4:45 | Merge triggers the pipeline Jordan set up in episode three. Build, publish to the local registry, stage-demo generation, notifications fan out. |
| 11 | 5:30 | One story shipped. Manager Dashboard ticks up. Pat has a walkthrough to review. Jordan has a green pipeline. Alex has BBF-2 already loaded on the Task Board. |
| 12 | 5:50 | This is what RobOS does. Every episode from here on is one story through this same loop. |

## Blockers / ready-checklist

- [ ] Canned Claude response for BBF-1 — write the actual diff + the answers for the Questionnaire + Quiz, save under `packages/robos-test/sandbox/data/model-problem/bbf-1/`.
- [ ] PR creation flow via `gh` stub needs to return a plausible PR URL and state.
- [ ] Jordan's AI Review response for BBF-1 should produce the "pin buf version" suggestion — add to the stub response library.
- [ ] Cut-between-desktops recording: easiest approach is to record Alex's session first, then Jordan's from the same VM logged in as Jordan, then weave in post. Or use a two-monitor layout with both users logged in simultaneously. **Decide before recording.**
- [ ] The automation rule that advances BBF-1 to `deployed` on merge — confirm it's set up in Video 03's deliverables.

## What this video proves

- RobOS doesn't just visualize a dev workflow — it *is* the workflow.
- AI is a pair programmer, not an autopilot; the Questionnaire + Quiz keep the human engaged.
- Every status transition, every notification, every dashboard update happens automatically from real events.
