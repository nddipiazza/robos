# RobOS Workflow Examples

This document walks through the complete RobOS workflow for each work item type, using a real example project:

**Example Project:** [buildbarn-forms](https://github.com/Hermetiq/buildbarn-forms) — A React component library that generates configuration forms for [Buildbarn](https://github.com/buildbarn), a remote build execution system. The library reads Buildbarn's protobuf config schemas and renders type-safe, validated form UIs for each config section (workers, storage, schedulers, etc.).

---

## Work Item Hierarchy

RobOS treats **Releases**, **Epics**, **Features/User Stories**, and **Bugs** as first-class citizens with distinct workflows. Each level has a default flow that follows a typical release process, but everything is customizable via **RobOS Config** (Workflow Studio).

```
Release  v1.0 "Buildbarn Forms GA"
├── Epic  "Config Form Library Core"
│   ├── Story  "Proto schema parser"
│   ├── Story  "Form renderer engine"
│   └── Story  "Validation engine"
├── Epic  "Individual Config Forms"
│   ├── Story  "Worker config form"
│   ├── Story  "Storage config form"
│   ├── Story  "Scheduler config form"
│   └── Bug    "Platform field crash"
└── Epic  "Packaging & Distribution"
    ├── Story  "npm package publishing"
    └── Story  "Storybook documentation"
```

### Default Release Flow (customizable in RobOS Config)

```
Planning → Development → Code Freeze → QA/Staging → Release Candidate → Production → Retrospective
```

Each stage has gates that must pass before advancing. Gates are configurable per project:

| Stage | Default Gates | Customizable? |
|-------|--------------|---------------|
| **Planning** | All epics have stories, all stories estimated | Yes — can add/remove gates |
| **Development** | Stories follow task workflow (see below) | Yes — stages, approvals |
| **Code Freeze** | All stories merged, no open blockers | Yes — freeze criteria |
| **QA/Staging** | All CI green, staging deploy successful, PO demo review | Yes — test requirements |
| **Release Candidate** | QA sign-off, no P0/P1 bugs open | Yes — sign-off roles |
| **Production** | RC deployed, smoke tests pass, rollback plan documented | Yes — deploy strategy |
| **Retrospective** | Retro completed, action items filed | Yes — can skip |

### Customizing Workflows via RobOS Config

All workflow definitions live in the **RobOS Distributed Store** (git-backed) and can be edited in **Workflow Studio**:

```yaml
# ~/.config/robos/workflows/default-release.yaml
release:
  stages:
    - id: planning
      name: Planning
      gates:
        - all_epics_have_stories
        - all_stories_estimated
      transitions: [development]
    - id: development
      name: Development
      gates:
        - all_stories_in_progress_or_done
      transitions: [code_freeze]
    - id: code_freeze
      name: Code Freeze
      gates:
        - all_stories_merged
        - no_open_blockers
      transitions: [qa_staging]
    # ... etc

epic:
  stages: [draft, ready, in_progress, done]
  gates:
    ready: [has_stories, po_approved]
    done: [all_stories_done]

story:
  stages: [setup, ai_questionnaire, ai_draft, human_review, ai_quiz, pr_created, ci, review_fix, approved, merged, deployed]
  # Each stage's gates are defined here...

bug:
  stages: [triage, setup, ai_draft, human_review, pr_created, ci, review_fix, merged, deployed]
  # Compressed workflow — no questionnaire or quiz by default
```

Teams can:
- Add/remove stages for any work item type
- Change gate requirements per stage
- Create entirely new work item types (e.g. "Spike", "Tech Debt", "Experiment")
- Override workflows per project or per repo
- AI can suggest workflow changes based on team patterns

---

## 1. Release: "v1.0 — Buildbarn Forms GA"

A release groups epics into a shippable unit with a coordinated timeline and quality gates.

### Planning

**App: Task Manager**
1. Manager/Dev Lead creates Release `v1.0`:
   - Target date: End of Q2
   - Assigns 3 epics (see hierarchy above)
   - AI generates a timeline based on story count, team velocity, and dependencies

**App: Manager Dashboard**
2. Release tracking view shows:
   - 3 epics, 10 stories, 0% complete
   - Dependency graph (Core must finish before Individual Forms)
   - Projected completion date with confidence interval

### Development

**App: Task Manager**
3. Epics and stories are worked through their individual workflows (see sections below).
4. Release dashboard auto-updates as stories progress.

### Code Freeze

**App: Task Manager**
5. When all stories are merged, Dev Lead triggers code freeze:
   - AI checks: all stories merged ✓, no open blockers ✓
   - Branch `release/v1.0` created
   - Only bug fixes allowed on the release branch from this point

### QA / Staging

**App: CI Monitor**
6. Release branch deployed to staging automatically.

**App: Stage Demo Viewer**
7. AI generates demo walkthrough for PO:
   - Shows each new form component
   - Demonstrates validation behavior
   - PO reviews and approves or files bugs

**App: Task Manager**
8. Any bugs found become work items on the release branch (see Bug workflow below).

### Release Candidate → Production

**App: CI Monitor**
9. RC published: `@hermetiq/buildbarn-forms@1.0.0-rc.1`
10. Smoke tests pass, QA signs off.
11. Production publish: `@hermetiq/buildbarn-forms@1.0.0`

**App: Task Manager**
12. Release status → `Shipped`. All epics and stories closed.

**App: Manager Dashboard**
13. Release summary: shipped on time, 10 stories, 2 bugs found in staging (both fixed), 3 review cycles average.

### Retrospective

**App: Task Manager**
14. AI generates retro summary:
    - What went well: AI draft quality was high, average 1.2 review cycles
    - What to improve: US-7 (validation engine) blocked US-3/4/5/6 for 3 days
    - Action items filed as tasks for next release

---

## 2. Epic: "Build the buildbarn-forms React Component Library"

An epic is a large body of work broken into user stories. It flows through all four personas.

### Phase 1: Requirements (Product Owner)

**App: Task Manager**
1. Product Owner creates a new Epic in the task server (Jira/GitHub):
   - *"Build a React component library that generates configuration forms from Buildbarn protobuf schemas. Users should be able to edit worker, storage, scheduler, and browser configs through validated forms instead of hand-editing JSONNET/YAML."*
2. AI assists with structuring the epic using readiness gates:
   - Problem statement: Manual Buildbarn config editing is error-prone and requires deep proto knowledge
   - Success criteria: Forms for all major config sections, validation against proto constraints, JSON/YAML export
   - Scope: React library (npm package), not a standalone app
   - Dependencies: Buildbarn proto definitions, protobuf reflection API

**App: EKGraph**
3. PO links the epic to relevant EKGraph nodes:
   - Repository: `github.com/Hermetiq/buildbarn-forms`
   - Proto source: `github.com/buildbarn/bb-storage`, `bb-remote-execution`, etc.
   - Related service: Buildbarn cluster (staging + prod)
   - Team: Platform Engineering

**App: Context Manager**
4. PO creates a context bundle for the epic:
   - Buildbarn proto definitions (`.proto` files)
   - Existing Buildbarn JSONNET configs as examples
   - Hermetiq dashboard screenshots showing where forms will be used
   - Links to Buildbarn config documentation

### Phase 2: Breakdown (Product Owner + Dev Lead)

**App: Task Manager**
5. AI breaks the epic into user stories:

| Story | Title | Priority |
|-------|-------|----------|
| US-1 | Proto schema parser — read .proto files and extract message/field definitions | High |
| US-2 | Form renderer — generate React form components from parsed proto schema | High |
| US-3 | Worker config form — `bb_worker` proto section with platform/concurrency fields | High |
| US-4 | Storage config form — `bb_storage` blobstore/AC/CAS sections | High |
| US-5 | Scheduler config form — `bb_scheduler` platform queues and drain configs | Medium |
| US-6 | Browser config form — `bb_browser` instance name and CAS settings | Medium |
| US-7 | Validation engine — proto constraint validation (required fields, enums, ranges) | High |
| US-8 | JSON/YAML export — serialize form state to deployable config | High |
| US-9 | Storybook documentation — interactive component gallery | Low |
| US-10 | npm package publishing — CI/CD for versioned releases | Medium |

6. Dev Lead reviews and approves the breakdown. Adds:
   - Story dependencies (US-1 must complete before US-2, US-7 before US-3/4/5/6)
   - Assigns developers to stories
   - Estimates complexity

### Phase 3: Tracking (Manager)

**App: Manager Dashboard**
7. Manager sees the epic on the dashboard:
   - 10 stories, 0% complete
   - Assigned to 2 developers
   - Target: 3 sprints
   - AI-generated timeline based on team velocity

---

## 2. User Story: "US-3 — Worker Config Form"

A user story is a single deliverable unit of work. This is where the AI-assisted task workflow shines.

> *As a platform engineer, I want a form component for `bb_worker` configuration so that I can edit worker platform, concurrency, and runner settings without hand-editing proto text.*

### Stage 1: Environment Setup

**App: Task Manager**
1. Developer picks up US-3. Status → `In Progress`.

**App: Workspace Manager**
2. Workspace auto-provisions:
   - Clones `github.com/Hermetiq/buildbarn-forms`
   - Checks out branch `feat/us-3-worker-config-form`
   - Runs `npm install`
   - Starts Storybook dev server (`npm run storybook`)
3. The workspace state is saved to RobOS distributed config so it can be resumed from any machine.

**App: Dev Tools**
4. Checks that required tools are installed:
   - Node.js 20 ✓
   - protoc (protobuf compiler) — installs if missing
   - VS Code or WebStorm ✓

**App: Dev Tools → IDE bridge**
5. Opens the workspace in the developer's IDE:
   - Navigates to `src/components/` where the form will be created
   - Opens `src/proto/parser.ts` (the schema parser from US-1) as reference
   - Sets a breakpoint at the existing `StorageConfigForm` component (from US-4 if done, or a skeleton)

### Stage 2: AI Questionnaire

**App: AI Agent Manager**
6. AI agent starts a session for US-3. Before coding, it asks clarifying questions:

   > **Agent:** "I'm looking at the `bb_worker` proto definition. The `WorkerConfiguration` message has nested `BuildExecutor` and `MountConfiguration` messages. Should the form render these as:
   > (a) Inline nested fieldsets
   > (b) Separate tab panels
   > (c) Collapsible sections?"

   Developer answers via text or **voice dictation**:
   > "Collapsible sections. And make the platform matcher field a dropdown populated from the scheduler's advertised platforms."

   > **Agent:** "The `concurrency` field accepts any `Runner` proto oneof — `LocalRunner`, `RemoteRunner`, `MergeRunner`, etc. Should I render a type selector dropdown that shows the appropriate fields for each runner type?"

   > "Yes, exactly. Like a discriminated union form."

**App: Context Manager**
7. Agent auto-attaches context:
   - `bb_worker` proto definition
   - Existing form components from US-2 as patterns
   - Buildbarn worker config examples from EKGraph
   - Developer's answers from the questionnaire

### Stage 3: AI Draft

**App: AI Agent Manager**
8. Agent implements the solution:

   Creates:
   - `src/components/WorkerConfigForm.tsx` — Main form component with collapsible sections
   - `src/components/RunnerTypeSelector.tsx` — Discriminated union form for Runner oneof
   - `src/components/PlatformMatcher.tsx` — Dropdown for platform selection
   - `src/components/__tests__/WorkerConfigForm.test.tsx` — Unit tests
   - `src/stories/WorkerConfigForm.stories.tsx` — Storybook stories

9. Agent creates a summary of what it built and why each decision was made.

**App: Task Manager**
10. Status → `AI Draft Complete`. Hours logged automatically.

### Stage 4: Human Review

**App: Workspace Manager**
11. Developer is notified the draft is ready. Workspace reloads with the new code.

**App: Dev Tools → IDE bridge**
12. IDE opens the diff view showing all changed files. Storybook hot-reloads to show the new form component.

13. Developer reviews:
    - Checks the form renders correctly in Storybook
    - Verifies the Runner type selector works for all oneof variants
    - Tests validation on required fields
    - Makes minor adjustments (tweaks label text, adjusts section ordering)

### Stage 5: AI Quiz

**App: AI Agent Manager**
14. Agent generates a quick quiz to confirm the developer understands the change:

    > Q1: "What happens when the user selects `RemoteRunner` in the runner type dropdown?"
    > Q2: "How does the PlatformMatcher component get its list of available platforms?"
    > Q3: "What validation runs when the user leaves the `concurrency` field empty?"

15. Developer answers. This ensures they can speak to the code in review.

### Stage 6: PR Draft

**App: AI Agent Manager**
16. Agent creates a pull request:

    **Title:** `feat(worker): add WorkerConfigForm with runner type selection and platform matching`

    **Description:**
    - Summary of changes
    - Screenshots of the form in Storybook
    - Test plan (unit tests + manual Storybook verification)
    - Links to US-3 ticket

**App: Task Manager**
17. Status → `PR Created`. PR link attached to task.

### Stage 7: CI Monitoring

**App: CI Monitor**
18. CI pipeline runs:
    - TypeScript type check ✓
    - Unit tests (23 passing) ✓
    - Storybook build ✓
    - Bundle size check ✓
    - Lint ✓

19. If CI fails, Agent auto-diagnoses and pushes a fix (→ Stage 8).

### Stage 8: Review-Fix Cycles

**App: PR Review Board**
20. Dev Lead reviews the PR:

    > "The RunnerTypeSelector should memoize the field list computation — it rerenders on every parent state change."

**App: AI Agent Manager**
21. Agent addresses the feedback:
    - Adds `useMemo` to the field list derivation
    - Pushes the fix
    - Comments on the PR: "Fixed — memoized field computation in RunnerTypeSelector"

**App: PR Review Board**
22. Dev Lead verifies the fix. Uses "Interactive Review":
    - AI creates a test that toggles between runner types rapidly
    - IDE opens at the memoized computation with a breakpoint
    - Dev Lead steps through, confirms no unnecessary rerenders

### Stage 9: PR Approval & Merge

**App: PR Review Board**
23. Dev Lead approves. PR merged to `main`.

**App: Task Manager**
24. Status → `Merged`. Hours finalized. Comment added with PR link.

### Stage 10: Deploy Monitoring

**App: CI Monitor**
25. npm publish pipeline runs:
    - Builds package
    - Publishes `@hermetiq/buildbarn-forms@1.3.0`
    - Updates Storybook docs site

**App: Task Manager**
26. Status → `Deployed`. Story complete.

**App: Manager Dashboard**
27. Manager sees: US-3 completed in 1.5 days, 1 review cycle, shipped in `v1.3.0`.

---

## 3. Bug: "Worker Config Form Crashes When Platform Field Is Empty"

A bug follows a compressed version of the workflow, focused on reproduction, fix, and verification.

### Report

**App: Task Manager**
1. Bug filed (from CI alert, user report, or PO finding during staging review):

   > **BUG-42:** "WorkerConfigForm crashes with 'Cannot read properties of undefined' when the platform matcher dropdown is left empty and the form is submitted. Stack trace points to `PlatformMatcher.tsx:47`."
   >
   > **Steps to reproduce:** Open worker config form → leave Platform field empty → click Submit
   > **Expected:** Validation error shown on the platform field
   > **Actual:** Uncaught TypeError, form goes blank

   Priority: High (blocks staging review)

### Stage 1: Environment Setup (automated)

**App: Workspace Manager**
2. Developer picks up BUG-42. Workspace auto-provisions:
   - Clones repo, checks out `fix/bug-42-platform-crash`
   - `npm install`, starts Storybook
   - **AI navigates to the crash site:** Opens `PlatformMatcher.tsx` at line 47 in the IDE
   - **Sets a breakpoint at the crash location**
   - **Runs the reproduction steps in Storybook** — developer sees the crash live

### Stage 2: AI Questionnaire (brief)

**App: AI Agent Manager**
3. Agent analyzes the crash:

   > **Agent:** "The crash is at `PlatformMatcher.tsx:47` where `selectedPlatform.properties` is accessed but `selectedPlatform` is `undefined` when no platform is selected. The validation schema doesn't mark this field as required. Should I:
   > (a) Add a null check and show a validation error
   > (b) Mark the field as required in the proto validation schema
   > (c) Both?"

   Developer: "Both. The field should be required, and there should be a null guard regardless."

### Stage 3: AI Draft

**App: AI Agent Manager**
4. Agent implements the fix:

   - `PlatformMatcher.tsx`: Adds null guard at line 47
   - `workerValidation.ts`: Adds `platform` to required fields
   - `WorkerConfigForm.test.tsx`: Adds regression test — submit with empty platform field → shows validation error, no crash

### Stage 4: Human Review (quick)

5. Developer verifies:
   - Storybook: leaves platform empty → red validation message, no crash ✓
   - Storybook: selects platform → form submits normally ✓
   - Regression test passes ✓

### Stage 5: AI Quiz (skipped for small bugs)

For critical bugs, the quiz is optional. Developer already verified the fix.

### Stage 6: PR Draft

**App: AI Agent Manager**
6. Agent creates PR:

   **Title:** `fix(worker): prevent crash when platform field is empty`

   **Description:**
   - Root cause: null dereference on unselected platform
   - Fix: null guard + mark field required in validation schema
   - Regression test added
   - Resolves BUG-42

### Stage 7-10: CI → Review → Merge → Deploy

**App: CI Monitor**
7. CI passes (including new regression test).

**App: PR Review Board**
8. Dev Lead approves quickly — it's a clear bug fix with a regression test.

**App: Task Manager**
9. BUG-42: `In Progress` → `PR Created` → `Merged` → `Deployed`
   - Total time: 45 minutes
   - AI logged hours and added comments automatically

**App: Stage Demo Viewer**
10. Product Owner gets a notification:
    > "BUG-42 fixed and deployed to staging. The worker config form now shows a validation error when the platform field is empty instead of crashing."

---

## Workflow Summary by Work Item Type

| Stage | Release | Epic | User Story | Bug |
|-------|---------|------|-----------|-----|
| **Planning** | Define scope, assign epics, set target date | PO creates structured epic with AI | PO + AI break epic into stories | Bug report filed |
| **Breakdown** | Epics broken into stories | AI suggests stories, Dev Lead reviews | Single story, ready to work | Single fix, pre-analyzed |
| **Development** | Track all epics/stories | Track all stories | Full task workflow (10 stages) | Compressed workflow |
| **Code Freeze** | Branch cut, only bug fixes | N/A (release-level) | N/A | Can be filed during freeze |
| **QA/Staging** | PO demos, QA sign-off | N/A (release-level) | N/A | Found bugs go back to dev |
| **Release** | RC → Production deploy | Closes when all stories done | Closes when merged + deployed | Closes when verified |
| **Retrospective** | AI-generated retro summary | N/A | N/A | Feeds MTTR metrics |

## Story/Bug Task Workflow Stages

| Stage | User Story | Bug |
|-------|-----------|-----|
| **Environment Setup** | Full workspace provisioning | Workspace + auto-navigate to crash site |
| **AI Questionnaire** | Agent asks clarifying questions | Agent asks about fix approach |
| **AI Draft** | Agent implements full feature | Agent implements fix + regression test |
| **Human Review** | Developer reviews AI's code | Developer verifies fix |
| **AI Quiz** | Agent quizzes developer on the change | Skipped for small fixes |
| **PR** | Agent creates PR with description | Agent creates PR with root cause |
| **CI** | Full test suite | Full suite + regression test |
| **Review-Fix Cycles** | Dev Lead reviews, agent fixes | Quick review |
| **Merge & Deploy** | Merge + publish | Merge + hotfix deploy |

## Apps Involved by Stage

| Stage | Primary App | Supporting Apps |
|-------|------------|-----------------|
| Release Planning | Task Manager | Manager Dashboard |
| Requirements | Task Manager | EKGraph, Context Manager |
| Breakdown | Task Manager | AI Agent Manager |
| Environment Setup | Workspace Manager | Dev Tools, Git Projects |
| AI Questionnaire | AI Agent Manager | Context Manager, Voice Dictation |
| AI Draft | AI Agent Manager | Context Manager, EKGraph |
| Human Review | Workspace Manager | Dev Tools (IDE bridge) |
| AI Quiz | AI Agent Manager | — |
| PR | AI Agent Manager | Git Projects |
| CI | CI Monitor | AI Agent Manager (auto-fix) |
| Review-Fix | PR Review Board | AI Agent Manager, Dev Tools (IDE bridge) |
| Code Freeze / QA | Task Manager | CI Monitor, Stage Demo Viewer |
| Release / Deploy | CI Monitor | Task Manager, Manager Dashboard |
| Retrospective | Task Manager | Manager Dashboard (AI-generated) |
| Workflow Customization | Workflow Studio | RobOS Config Manager |
