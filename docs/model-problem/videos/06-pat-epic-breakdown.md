---
title: "06 — Pat breaks the rewrite into 10 stories"
parent: Video Production Plan
grand_parent: The Model Problem
layout: default
nav_order: 6
---

# Video 06 — Pat breaks the rewrite into 10 stories
{: .no_toc }

**Protagonist:** Pat (Product Engineer)
**Arc:** Setup
**Target length:** 2:30
**Apps in frame:** Issue Manager · Context Manager · Workflow Studio

## Story beat

Pat knows Buildbarn and knows what buildbarn-forms needs to do. The hard part isn't writing the epic — it's turning one sentence ("finish the React library") into ten acceptance-criteria-complete stories an AI agent can execute against. RobOS does the translation: Pat writes the epic, connects the right context sources, and the AI drafts the ten stories with real technical scope.

## Pre-seeded state

- Inherits the settings.json Dana produced in Video 01.
- Fixture F4 not yet created — this video creates it.
- `buildbarn-forms` knowledge graph (`~/source/hermetiq/hermetiq-genai-agent`) is available locally; Pat will add it as a Context Manager source.

## Scene list

1. **Cold open** — Pat logs in. Dev Central shows "no tasks assigned". Context Manager is empty.
2. **Context wiring (0:20–0:50)** — Open Context Manager. Add three sources: the `hermetiq-genai-agent` knowledge graph (local folder), the `buildbarn-forms` repo, and the `buildbarn-forms-proto` repo. Scope all three to Issue Manager.
3. **Epic creation (0:50–1:30)** — Open Issue Manager. Click **New Issue** → type `bbf` → Workflow Studio suggests type "Feature" or "Epic" based on size → select Epic. Paste in Pat's epic description (pre-drafted fixture). Tag with `scope:buildbarn-forms`.
4. **AI breakdown (1:30–2:15)** — Click **AI Breakdown** button on the epic. Panel opens. Pat types: *"Break this epic into implementation-ready stories based on the knowledge-graph refactor plan and the current state of the buildbarn-forms repo."* Click **Generate**. Claude streams a list of ten stories, each with: title, description, acceptance criteria, estimated size, dependencies. Pat reviews, tweaks one title, clicks **Save all as child stories**.
5. **Close (2:15–2:30)** — Task Board opens automatically showing the 10 new stories in the backlog column. Narration lands: *"Ten stories, ten engineering videos. Let's build."*

## Narration cues (draft)

| # | At | Text |
|:-:|:-:|:-----|
| 1 | 0:00 | Pat's the product engineer — knows the problem, knows Buildbarn, knows what the library needs to do. |
| 2 | 0:20 | Before writing the epic, Pat gives the AI the right context. Three sources: the knowledge graph, the draft repo, and the proto types it depends on. |
| 3 | 0:55 | Now the epic itself — one paragraph about what "done" looks like for buildbarn-forms. |
| 4 | 1:35 | AI Breakdown takes the epic, reads the context, and drafts implementation-ready stories with acceptance criteria. |
| 5 | 1:55 | Ten stories, each scoped so a developer can pick one up and know exactly when they're done. |
| 6 | 2:20 | Every one of those stories becomes a video in this series. Let's build. |

## Blockers / ready-checklist

- [ ] The "AI Breakdown" button in Issue Manager — does it exist as of v0.0.5, or is it one of the features we're narrating past? **Verify.** If not built, decide to build it or use a canned response flow similar to our workflow-studio gh-copilot fixture.
- [ ] Pre-draft the epic description (prose the viewer sees Pat paste in) and the ten stories the AI should produce. Save as `packages/robos-test/sandbox/data/model-problem/bbf-epic.md` + `bbf-stories.json`.
- [ ] Context Manager's per-source scoping to Issue Manager must be real — verify the scope picker in the app.

## Deliverables produced by this video

- Fixture **F4** — epic + 10 stories populated in the BBF Jira project and in `~/.config/robos/settings.json`.
- Backlog is now ready for video 04 (Alex's onboarding) and 05 (first engineering pick-up).
