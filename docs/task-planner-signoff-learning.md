# Task Planner signoff and feature learning

Work items expose Required signoff with a People Directory identity, verified GitHub login, and plan/PR/both scope. Saving a requirement clears previous plan approval. Plan approval records the authenticated GitHub login and exact plan hash; implementation checks the required identity. PR merging requires the designated reviewer's latest decisive approval on the current head commit. GitHub branch protections still apply.

Delete work item from Planner removes one local record, clears its plan approval, and saves a recovery copy under the Task Planner `deleted-work-items` directory. It refuses running agents and project containers. Task-server issues remain available for reimport.

Feature Viewer has an E-learning tab. Choose a graph by name using the shared `<robos-kgraph-selector>` component, then create or reopen a guided reading/reflection course from the saved plan. No saved plan means no course. Markdown sections become lessons, with source markdown and plan hash retained in a `robos:ELearning` node. Matching plan versions reuse the existing node; revised plans create new versions. All graph writes go through GraphWorkspace proposal validation and apply. Lesson checkboxes are session-only reading aids, not signoff or completion certificates.

The reusable selector loads graph titles through `window.robosKGraphs.list/add`. Apps register `packages/robos-lib/kgraph-selector-main.js` and expose those two preload methods. The registry includes configured app graphs, `ROBOS_GRAPH_ROOT`, and user-added workspaces. Add KGraph opens a native folder picker; the normal UI displays graph titles rather than filesystem paths.

Validation: 13 targeted workflow, deletion, signoff, and graph-course tests; live Planner deletion/reimport of #50–#52, persisted Tim Potter signoff on all three, rejection of approval from another account, and creation/reuse of a course in an isolated QA graph. QA Planner record removed after verification.

## Shared player

`packages/robos-lib/elearning-player.js` is the canonical `<robos-elearning-player>` web component. Task Planner and `robos-elearning` load this same file; generated Electron courses bundle this source rather than generating another player. Set `.course` to the KGraph course node. It supports source Markdown, legacy lab steps and quizzes, section navigation, and browser-local progress scoped to the course content. The `progress-change` event lets app hosts handle progress or certificate workflows. A reading-only feature plan does not issue a certification.

The player renders untrusted Markdown using Marked and DOMPurify, creates quiz controls through DOM APIs, and validates answers against the course definition. `node packages/robos-lib/elearning-player.e2e.cjs` tests the live Planner for Markdown sanitization, incorrect/correct quiz answers, navigation, and reloaded progress. Scaffold tests verify that the generated app bundles the canonical source and its generated JavaScript parses.

Feature #50 was planned through RobOS's Codex sandbox, explicitly saved in Task Planner, and its Create elearning button generated an eight-section course in the Hermetiq KGraph. Its plan remains awaiting Tim's signoff. The standalone app and Planner were verified against that same stored course. Planner retains a course reference and reopens it after reload.

## Updating courses with an AI prompt

The shared player exposes **Update course with AI** using the standard `robos-ai-textarea`, an initially disabled Preview update button, and Ctrl+Enter submission. Both Task Planner and the standalone e-learning app expose the same `robosCourseEditor` preload API backed by `course-editor-main.js`. Codex generates a structured course revision in a read-only session. RobOS validates sections and quiz answers, checks the graph revision, and presents the result in a read-only instance of the same player. Save applies the pinned GraphWorkspace proposal; discard leaves the course unchanged. Editing course content never changes the feature plan or its signoff. Progress is scoped to course content, so revised courses begin with fresh progress.

Sandbox GitHub access is checked with the exact CLI credential supplied to the
agent before it starts. The task and paginated comments are saved in the ephemeral
home as `task-context.json`. Agents are directed to use this authenticated CLI for
additional GitHub references; provider-hosted connectors have independent access
and their 404 responses do not establish that a private issue was removed.
Access failures stop launch with an actionable Task Server connection error.
The e-learning source remains the saved plan: correcting source findings requires
saving the plan and generating a new course revision in Task Planner.
