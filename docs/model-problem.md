# RobOS Model Problem: Acme Inc Builds Buildbarn Forms

This document walks through RobOS end-to-end using a concrete scenario. A company called **Acme Inc** adopts RobOS to build the [buildbarn-forms](https://github.com/acme-corp/buildbarn-forms) project — a React component library for editing Buildbarn remote build execution configurations. The companion repo [buildbarn-forms-proto](https://github.com/acme-corp/buildbarn-forms-proto) holds the protobuf definitions.

Every phase — company setup, developer onboarding, task breakdown, coding, review, deploy, and management dashboards — happens inside RobOS.

---

## Cast of Characters

| Person | Role | RobOS User Type |
|--------|------|-----------------|
| **Dana** | Dev Manager | Manager |
| **Pat** | Product Engineer | Product Owner |
| **Jordan** | Dev Lead | Dev Lead |
| **Alex** | Developer | Developer |

---

## Phase 1: Company & Environment Setup

### 1.1 — Create RobOS Users

Dana (Dev Manager) provisions the RobOS VM and creates accounts for the team. Each user gets a RobOS desktop login, `~/.config/robos/` profile, and GPG/SSH keys via the **Security Setup** app on first login.

| User | Login | Role in RobOS |
|------|-------|---------------|
| dana | `dana@acme` | Manager — dashboards, workflow config, task server admin |
| pat | `pat@acme` | Product Owner — requirements, epic/story creation, staging review |
| jordan | `jordan@acme` | Dev Lead — code review, architecture decisions, PR approvals |
| alex | `alex@acme` | Developer — task implementation, AI-assisted coding |

Each user's **RobOS Preferences** stores their role, notification preferences, and AI model settings.

### 1.2 — Dana Sets Up Jira in Task Servers

**App: Task Servers**

Dana opens the Task Servers app and configures Jira as the team's task tracking system:

1. **Add connection**: Jira Cloud instance `acme.atlassian.net`
2. **Authenticate**: OAuth 2.0 flow — Dana authorizes RobOS to access the Jira project
3. **Map project**: Jira project `BBF` (Buildbarn Forms) → RobOS project
4. **Map statuses**: Jira statuses → RobOS workflow stages:

   | Jira Status | RobOS Stage |
   |-------------|-------------|
   | To Do | `backlog` |
   | In Progress | `in_progress` |
   | In Review | `in_review` |
   | Deploying | `deploying` |
   | Done | `deployed` |

5. **Sync**: Initial sync pulls all existing Jira issues into RobOS. Bidirectional sync enabled — status changes in RobOS write back to Jira and vice versa.

### 1.3 — Dana Creates the Task Workflow

**App: Workflow Studio**

Dana defines the task workflow that all stories and bugs will follow. This workflow drives automatic status transitions throughout the entire lifecycle:

```yaml
# ~/.config/robos/workflows/acme-default.yaml
story:
  stages:
    - id: backlog
      name: Backlog
      transitions: [in_progress]

    - id: in_progress
      name: In Progress
      auto_enter: task_assigned_and_branch_created
      transitions: [in_review]

    - id: in_review
      name: In Review
      auto_enter: pr_created
      transitions: [approved]

    - id: approved
      name: Approved
      auto_enter: pr_approved
      transitions: [deploying]

    - id: deploying
      name: Deploying
      auto_enter: pr_merged
      transitions: [deployed]

    - id: deployed
      name: Deployed
      auto_enter: deploy_pipeline_completed
```

Key design: **every transition is event-driven**. When a PR is created, the task moves to `in_review` automatically. When the PR is approved, it moves to `approved`. When merged, `deploying`. When the deploy pipeline completes, `deployed`. No manual status updates needed.

These events flow through the Event Bus (Epic 18) and the Rule Engine matches them to status transitions.

### 1.4 — Jordan Sets Up the Git Projects

**App: Git Projects**

Jordan (Dev Lead) adds the two repositories to RobOS:

**Repository 1: buildbarn-forms**
- URL: `https://github.com/acme-corp/buildbarn-forms`
- Clone path: `~/projects/buildbarn-forms`
- Branch strategy: feature branches off `main`
- CI: GitHub Actions

**Repository 2: buildbarn-forms-proto**
- URL: `https://github.com/acme-corp/buildbarn-forms-proto`
- Clone path: `~/projects/buildbarn-forms-proto`
- Branch strategy: feature branches off `main`

For each repo, Jordan configures:

#### RobOS Project Instructions

Jordan writes project-specific RobOS instructions that AI agents and the onboarding system will follow. These are stored in the repo as `ROBOS.md` and synced to `~/.config/robos/projects/`:

```markdown
# ROBOS.md — buildbarn-forms

## Prerequisites
- Node.js 20+
- protoc (protobuf compiler) 25+
- GitHub CLI (gh) authenticated

## App Secrets
- GITHUB_TOKEN — GitHub personal access token (repo, read:org scopes)
- NPM_TOKEN — npm publish token (for @acme scope)
- JIRA_API_TOKEN — Jira API token for status sync

## Local Dev Setup
1. npm install
2. npm run proto:generate    # Generate TS types from proto definitions
3. npm run dev               # Start Storybook dev server on :6006

## Test
npm test                     # Jest unit tests
npm run test:e2e             # Playwright component tests

## Startup Script
npm run dev

## Shutdown Script
# Kill Storybook dev server
pkill -f "storybook dev" || true
```

#### App Secrets Configuration

**App: Pass Manager**

Jordan configures the secrets that developers need. These are stored in the GPG-encrypted password store (`~/.password-store/`) and distributed to team members via RobOS:

| Secret | Purpose | Scope |
|--------|---------|-------|
| `acme/github-token` | GitHub API access | All developers |
| `acme/npm-token` | npm publish access | Dev Lead + CI |
| `acme/jira-api-token` | Jira bidirectional sync | All developers |

Developers will receive these secrets automatically during onboarding (Phase 3).

---

## Phase 2: Product Engineer Creates Epics & Stories

### 2.1 — Pat Defines the Problem

**App: Task Manager**

Pat (Product Engineer) opens the Task Manager and creates a new Epic:

> **Epic: Build the buildbarn-forms React Component Library**
>
> **Problem:** Platform engineers at Acme configure Buildbarn (remote build execution) by hand-editing JSONNET and YAML files based on complex protobuf schemas. This is error-prone, undocumented, and requires deep proto knowledge. We need a React component library that generates validated configuration forms from Buildbarn's protobuf definitions.
>
> **Success Criteria:**
> - Form components for all major Buildbarn config sections (worker, storage, scheduler, browser)
> - Type-safe validation against proto constraints
> - JSON/YAML export for deployment
> - Published as `@acme/buildbarn-forms` npm package
>
> **Repos:** buildbarn-forms, buildbarn-forms-proto

### 2.2 — AI-Assisted Story Breakdown

**App: Task Manager → AI Breakdown**

Pat clicks "AI Breakdown" on the epic. The AI agent reads:
- The epic description
- The `buildbarn-forms` repo structure
- The `buildbarn-forms-proto` proto definitions
- Existing Buildbarn config examples from the EKGraph

AI generates a story breakdown:

| # | Story | Priority | Points | Assignee |
|---|-------|----------|--------|----------|
| BBF-1 | Proto schema parser — read `.proto` files and extract message/field definitions | High | 5 | Alex |
| BBF-2 | Form renderer engine — generate React form components from parsed proto schema | High | 8 | Alex |
| BBF-3 | Worker config form — `bb_worker` proto with platform/concurrency fields | High | 5 | Alex |
| BBF-4 | Storage config form — `bb_storage` blobstore/AC/CAS sections | High | 5 | Alex |
| BBF-5 | Scheduler config form — `bb_scheduler` platform queues and drain configs | Medium | 5 | Alex |
| BBF-6 | Browser config form — `bb_browser` instance name and CAS settings | Medium | 3 | Alex |
| BBF-7 | Validation engine — proto constraint validation (required fields, enums, ranges) | High | 8 | Alex |
| BBF-8 | JSON/YAML export — serialize form state to deployable config | High | 5 | Alex |
| BBF-9 | Storybook documentation — interactive component gallery | Low | 3 | Alex |
| BBF-10 | npm package publishing — CI/CD for versioned releases | Medium | 5 | Jordan |

Pat reviews the breakdown, adjusts priorities, and confirms. The stories are created in Jira (via bidirectional sync) and appear in every team member's RobOS dashboard.

Jordan assigns reviewers: Jordan is the reviewer for all PRs in this project.

---

## Phase 3: Developer Onboarding

Alex is a new developer joining the Buildbarn Forms project. The entire onboarding happens through RobOS with minimal manual steps.

### 3.1 — First Login

Alex logs into the RobOS VM for the first time. The **Security Setup** app launches automatically:

1. **GPG key generation** — Alex creates a GPG keypair for the encrypted password store
2. **SSH key generation** — Ed25519 key generated, public key copied to clipboard
3. **GitHub SSH setup** — Alex pastes the SSH key into GitHub settings (or RobOS does it via `gh ssh-key add`)
4. **GitHub CLI auth** — `gh auth login` flow completes, token stored securely

### 3.2 — Project Onboarding

**App: Git Projects**

Alex opens Git Projects and sees the two repos Jordan configured. Clicking "Set Up" on `buildbarn-forms` triggers the automated onboarding sequence:

**Step 1: Secrets Distribution**
- RobOS checks that Alex has the required secrets from `ROBOS.md`
- Missing secrets are distributed from the Pass Manager (GPG-encrypted, Alex's key)
- `GITHUB_TOKEN`, `JIRA_API_TOKEN` are injected into `~/.config/robos/secrets/`
- Environment variables auto-configured for the project

**Step 2: Software Installation**
- **Dev Tools** reads the prerequisites from `ROBOS.md`
- Node.js 20 — already installed ✓
- protoc 25 — not found → installs automatically with streaming progress
- GitHub CLI — already authenticated ✓

**Step 3: Repository Clone & Install**
```
Cloning https://github.com/acme-corp/buildbarn-forms → ~/projects/buildbarn-forms
Cloning https://github.com/acme-corp/buildbarn-forms-proto → ~/projects/buildbarn-forms-proto
Running: npm install (buildbarn-forms)
Running: npm run proto:generate
```

**Step 4: Startup Script Verification**
```
Running: npm run dev
✓ Storybook dev server started on http://localhost:6006
```

**Step 5: Test Script Verification**
```
Running: npm test
✓ 47 tests passing
Running: npm run test:e2e
✓ 12 component tests passing
```

**Step 6: Shutdown Script Verification**
```
Running shutdown script...
✓ Storybook dev server stopped
```

Alex sees a green checkmark for every step. The project is ready. Total onboarding time: ~3 minutes, mostly waiting for `npm install`.

### 3.3 — Onboarding Complete

**App: Dev Central**

Alex's Dev Central dashboard now shows:
- **Sprint Board**: 10 stories in the BBF epic, BBF-1 is "ready to start"
- **Git Projects**: 2 repos cloned and healthy
- **Tools**: All prerequisites installed
- **Secrets**: All project secrets available

---

## Phase 4: Developer Works a Task

### 4.1 — Alex Picks Up BBF-3 (Worker Config Form)

**App: Task Manager**

Alex picks up story BBF-3. The moment Alex clicks "Start Work":

1. **Jira status → `In Progress`** (automatic, via Task Servers bidirectional sync)
2. **Branch created**: `feat/bbf-3-worker-config-form` off `main`
3. **Workspace provisioned**: repo checked out to the new branch, `npm install` runs, Storybook starts
4. **IDE opens**: WebStorm/VS Code launches with the workspace, navigated to `src/components/`
5. **Event Bus publishes**: `task_started` event → Work Journal records it

**Visible to everyone:**

The Task Manager UI (accessible to Dana, Pat, Jordan, and Alex) updates in real-time:

```
BBF-3: Worker Config Form
Status: In Progress ●
Assignee: Alex
Branch: feat/bbf-3-worker-config-form
Started: 2026-03-21 09:15
```

### 4.2 — AI Questionnaire

**App: AI Agent Manager**

The AI agent reviews the task context — proto definitions, existing form components, ROBOS.md — and asks clarifying questions before writing any code:

> **Agent:** "The `WorkerConfiguration` message has nested `BuildExecutor` and `MountConfiguration`. Should I render these as inline fieldsets, tab panels, or collapsible sections?"

Alex: "Collapsible sections."

> **Agent:** "The `concurrency` field accepts a `Runner` proto oneof — `LocalRunner`, `RemoteRunner`, `MergeRunner`. Should I render a type selector dropdown?"

Alex: "Yes, like a discriminated union form."

### 4.3 — AI Draft

The agent implements:
- `src/components/WorkerConfigForm.tsx` — main form with collapsible sections
- `src/components/RunnerTypeSelector.tsx` — discriminated union for Runner oneof
- `src/components/PlatformMatcher.tsx` — platform dropdown
- `src/components/__tests__/WorkerConfigForm.test.tsx` — unit tests
- `src/stories/WorkerConfigForm.stories.tsx` — Storybook stories

### 4.4 — Human Review & PR Creation

Alex reviews the draft in the IDE, makes minor tweaks, and the agent creates a pull request:

> **PR #12:** `feat(worker): add WorkerConfigForm with runner type selection`
>
> Resolves BBF-3. Adds collapsible-section worker config form with discriminated union runner type selector and platform matcher dropdown.

**The moment the PR is created:**
- **Jira status → `In Review`** (automatic — `pr_created` event triggers the workflow transition)
- **Event Bus publishes**: `pr_opened` event
- **Reviewers assigned**: Jordan is auto-assigned as reviewer (configured per-repo)

### 4.5 — Visible Progress

**App: Task Manager** (visible to everyone on the team)

```
BBF-3: Worker Config Form
Status: In Review ●
Assignee: Alex
Branch: feat/bbf-3-worker-config-form
PR: #12 (CI running...)
Started: 2026-03-21 09:15
PR Created: 2026-03-21 11:30
```

Dana (Manager) sees this on the **Manager Dashboard** alongside all other in-progress work. Pat (Product Engineer) sees it on the sprint board in **Dev Central**.

---

## Phase 5: Code Review with Notifications

### 5.1 — Jordan Gets Notified

**Event chain:**
1. `pr_opened` event hits the Event Bus
2. Rule Engine matches: "PR opened in buildbarn-forms → notify reviewers"
3. Action Registry fires `notify` action:
   - **Category**: `pr_review`
   - **Tier**: `warning`
   - **Message**: "PR #12 needs review: Worker Config Form (Alex)"

**Toast Daemon** pops a notification on Jordan's desktop:

> 🔶 **PR Review Requested**
> PR #12: feat(worker): add WorkerConfigForm — Alex
> [Click to open in Review Tool]

The notification also appears in Jordan's **Notifications App** history and as a badge count on the system tray.

### 5.2 — Jordan Reviews with the AI Review Tool

**App: PR Review Board**

Jordan clicks the notification and lands in the PR Review Board. The review tool shows:

**AI Summary Panel:**
- **What changed**: 5 new files — form component, runner selector, platform matcher, tests, stories
- **Why**: Implements BBF-3, adds worker config editing UI
- **Risk assessment**: Low — new files only, no changes to existing components
- **Test coverage**: 23 new unit tests, 3 Storybook stories

**AI Actions:**

| Action | Description |
|--------|-------------|
| **"Start the app"** | Launches Storybook, opens the WorkerConfigForm story in a browser |
| **"Run to breakpoint"** | Opens IDE at `WorkerConfigForm.tsx`, sets breakpoint at form submission handler, runs the Storybook test that exercises the form |
| **"Run tests"** | Executes the test suite and shows results inline |
| **"Generate edge case test"** | AI creates a test for an untested scenario (e.g., rapid runner type toggling) |

Jordan clicks **"Start the app"** — Storybook launches and shows the worker config form live. Jordan interacts with it, tries different runner types, verifies the collapsible sections.

Jordan then clicks **"Run to breakpoint"** — the IDE opens at the form submission handler. Jordan steps through the code, verifies the form data is correctly serialized.

### 5.3 — Review Feedback

Jordan leaves a review comment:
> "The RunnerTypeSelector should memoize the field list computation — it rerenders on every parent state change."

**Event chain:**
1. `pr_review_received` event (state: `changes_requested`) hits Event Bus
2. Rule Engine: "PR review with changes requested → notify developer"
3. Toast on Alex's desktop:
   > 🔶 **Changes Requested**
   > PR #12: Jordan requested changes — "memoize field list computation"

The AI agent picks up the feedback, adds `useMemo`, pushes the fix, and comments on the PR.

### 5.4 — Approval

Jordan re-reviews, approves:
> ✅ "LGTM — memoization fix looks good."

**Event chain:**
1. `pr_review_received` event (state: `approved`) hits Event Bus
2. **Jira status → `Approved`** (automatic — `pr_approved` event triggers workflow transition)
3. Notification to Alex:
   > ✅ **PR Approved**
   > PR #12 approved by Jordan. Ready to merge.

---

## Phase 6: Merge & Deploy

### 6.1 — Alex Merges

Alex clicks "Merge" on the PR.

**Event chain:**
1. `pr_merged` event hits Event Bus
2. **Jira status → `Deploying`** (automatic — `pr_merged` triggers workflow transition)
3. CI/CD pipeline triggers: build, test, npm publish

### 6.2 — Deploy Pipeline Completes

GitHub Actions publishes `@acme/buildbarn-forms@1.3.0` and deploys the updated Storybook docs.

**Event chain:**
1. `deploy` event hits Event Bus (source: CI monitor polling GitHub Actions)
2. **Jira status → `Deployed`** (automatic — `deploy_pipeline_completed` triggers workflow transition)
3. Rule Engine fires multiple notifications:

**To Alex (developer):**
> ✅ **Deploy Complete**
> BBF-3 shipped in @acme/buildbarn-forms@1.3.0

**To Jordan (dev lead / repo owner):**
> ℹ️ **Deploy Complete**
> buildbarn-forms v1.3.0 published — includes PR #12 (Worker Config Form)

**To Dana (manager) and Pat (product engineer):**
> ℹ️ **Deploy Complete**
> buildbarn-forms v1.3.0 — BBF-3 Worker Config Form deployed

### 6.3 — Final Task State

**App: Task Manager** (visible to everyone)

```
BBF-3: Worker Config Form
Status: Deployed ✅
Assignee: Alex
Branch: feat/bbf-3-worker-config-form (merged)
PR: #12 (merged, 1 review cycle)
Version: @acme/buildbarn-forms@1.3.0
Timeline:
  Started:     2026-03-21 09:15
  PR Created:  2026-03-21 11:30
  Approved:    2026-03-21 14:20
  Merged:      2026-03-21 14:25
  Deployed:    2026-03-21 14:40
```

Every status transition happened automatically — no one manually updated Jira at any point.

---

## Phase 7: Automatic Task Status Transitions (Summary)

The entire task lifecycle is driven by events, not manual updates. Here's the complete chain:

| Trigger Event | Status Transition | How It Happens |
|---------------|-------------------|----------------|
| Developer clicks "Start Work" | `Backlog → In Progress` | Task Manager fires `task_started` event |
| Branch created + workspace provisioned | — | Workspace Manager fires `branch_created` event |
| AI agent creates PR | `In Progress → In Review` | `pr_created` event → Rule Engine → Jira update |
| Reviewer approves PR | `In Review → Approved` | `pr_review_received` (approved) → Rule Engine → Jira update |
| PR merged to main | `Approved → Deploying` | `pr_merged` event → Rule Engine → Jira update |
| CI/CD pipeline succeeds | `Deploying → Deployed` | `deploy` event → Rule Engine → Jira update |

All transitions are:
- Defined in Workflow Studio (Phase 1.3)
- Executed by the Event Bus + Rule Engine (Epic 18)
- Synced bidirectionally to Jira via Task Servers
- Visible in real-time to everyone via Task Manager

---

## Phase 8: Dashboards & Visibility

### 8.1 — Dana's Manager Dashboard

**App: Manager Dashboard**

Dana (Dev Manager) opens the Manager Dashboard and sees a rich, first-class view of the entire project:

**Sprint Board View:**
```
Buildbarn Forms — Sprint 1
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Backlog (4)          In Progress (1)    In Review (0)    Deployed (5)
┌──────────────┐    ┌──────────────┐                   ┌──────────────┐
│ BBF-5        │    │ BBF-8        │                   │ BBF-1 ✅     │
│ Scheduler    │    │ JSON/YAML    │                   │ Proto parser │
│ form         │    │ export       │                   ├──────────────┤
├──────────────┤    │ Alex         │                   │ BBF-2 ✅     │
│ BBF-6        │    │ ● In Progress│                   │ Form renderer│
│ Browser form │    └──────────────┘                   ├──────────────┤
├──────────────┤                                       │ BBF-3 ✅     │
│ BBF-9        │                                       │ Worker form  │
│ Storybook    │                                       ├──────────────┤
├──────────────┤                                       │ BBF-4 ✅     │
│ BBF-10       │                                       │ Storage form │
│ npm publish  │                                       ├──────────────┤
└──────────────┘                                       │ BBF-7 ✅     │
                                                       │ Validation   │
                                                       └──────────────┘
```

**Velocity & Metrics:**
- Stories completed this sprint: 5/10
- Average cycle time: 1.8 days (from In Progress → Deployed)
- Average review cycles: 1.2
- AI draft acceptance rate: 85% (minimal human edits)
- On track for sprint completion: Yes

**Deployment Tracker:**
| Version | Date | Stories | Status |
|---------|------|---------|--------|
| v1.3.0 | Mar 21 | BBF-3 (Worker form) | ✅ Deployed |
| v1.2.0 | Mar 20 | BBF-4 (Storage form) | ✅ Deployed |
| v1.1.0 | Mar 18 | BBF-7 (Validation engine) | ✅ Deployed |
| v1.0.0 | Mar 15 | BBF-1, BBF-2 (Core) | ✅ Deployed |

**Per-Developer View:**
| Developer | In Progress | In Review | Deployed (Sprint) | Avg Cycle Time |
|-----------|-------------|-----------|-------------------|----------------|
| Alex | 1 (BBF-8) | 0 | 4 | 1.6 days |
| Jordan | 0 | 0 | 1 (BBF-10) | 2.1 days |

### 8.2 — Pat's Product Dashboard

**App: Dev Central**

Pat (Product Engineer) opens Dev Central and sees the product-focused view:

**Epic Progress:**
```
Buildbarn Forms Component Library
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Progress: ██████████████░░░░░░ 50% (5/10 stories deployed)

High Priority:  4/5 done ✅   (BBF-1, 2, 3, 7 done; BBF-8 in progress)
Medium Priority: 1/3 done     (BBF-10 done; BBF-5 backlog)
Low Priority:    0/2          (BBF-6, BBF-9 backlog)
```

**Recently Deployed:**
- BBF-3 Worker Config Form — Alex — deployed Mar 21 at 14:40
  - *"Platform engineers can now edit worker configs through a validated form with collapsible sections and runner type selection."*
- BBF-4 Storage Config Form — Alex — deployed Mar 20 at 16:10
  - *"Storage blobstore, AC, and CAS configuration forms with nested proto field editing."*

Pat can click any deployed story to see a link to the live Storybook, the PR, and the AI-generated changelog entry.

**Blocker Radar:**
- No blockers currently
- BBF-5 (Scheduler form) blocked by: BBF-7 (Validation engine) — resolved Mar 18 ✅

### 8.3 — Jordan's Dev Lead Dashboard

**App: Dev Central + PR Review Board**

Jordan sees:

**Open Reviews:**
- No PRs waiting for review (all current work is in progress, not yet in review)

**Review Activity (This Sprint):**
| PR | Story | Author | Cycles | Time to Approve |
|----|-------|--------|--------|-----------------|
| #12 | BBF-3 Worker form | Alex | 1 | 2h 50m |
| #11 | BBF-4 Storage form | Alex | 1 | 1h 30m |
| #10 | BBF-7 Validation | Alex | 2 | 4h 15m |
| #9 | BBF-2 Form renderer | Alex | 1 | 2h 00m |
| #7 | BBF-10 npm publish | Jordan (self) | 0 | — |

**CI Health:**
- Last 10 builds: 9 passing, 1 failed (auto-fixed by agent)
- Test coverage: 87%
- Build time trend: stable at ~2 minutes

### 8.4 — Alex's Developer Dashboard

**App: Dev Central**

Alex sees their personal work view:

**My Current Work:**
```
● BBF-8: JSON/YAML Export — In Progress
  Branch: feat/bbf-8-export
  AI Draft: In questionnaire phase
  Time in stage: 25 minutes
```

**My Completed (This Sprint):**
- BBF-3 Worker Config Form — 1.5 days, 1 review cycle ✅
- BBF-4 Storage Config Form — 1.2 days, 1 review cycle ✅
- BBF-7 Validation Engine — 2.1 days, 2 review cycles ✅
- BBF-1 Proto Schema Parser — 1.8 days, 1 review cycle ✅

**Work Journal (auto-captured):**
```
2026-03-21
  09:15  Started BBF-3 (Worker Config Form)
  09:20  AI questionnaire: answered 2 questions about form layout
  09:45  AI draft complete: 5 files created
  10:30  Human review complete, minor tweaks applied
  11:30  PR #12 created, CI running
  14:20  PR #12 approved by Jordan
  14:25  PR #12 merged
  14:40  v1.3.0 deployed with BBF-3
  15:00  Started BBF-8 (JSON/YAML Export)
```

---

## Notification Summary

Throughout the entire lifecycle, the Event Bus + Rule Engine deliver targeted notifications without anyone configuring them manually (beyond Dana's initial workflow setup):

| Event | Who Gets Notified | Tier | Category |
|-------|-------------------|------|----------|
| Task started | Dana (manager dashboard update) | info | task |
| PR created | Jordan (reviewer) | warning | pr_review |
| CI failed | Alex (author) | critical | ci_cd |
| CI passed | Alex (author) | info | ci_cd |
| Review: changes requested | Alex (author) | warning | pr_review |
| Review: approved | Alex (author) | info | pr_review |
| PR merged | Alex, Jordan | info | pr_review |
| Deploy complete | Alex, Jordan, Dana, Pat | info | ci_cd |

All notifications are:
- Recorded in notification history (Notifications App)
- Filterable by category and tier
- Configurable per-user (quiet hours, DND, per-category toggles)
- Click-to-navigate to the relevant app context

---

## What RobOS Automated (Zero Manual Effort)

| Activity | Traditional Workflow | RobOS |
|----------|---------------------|-------|
| Update Jira status | Developer updates manually (or forgets) | Automatic — event-driven transitions |
| Notify reviewer | Developer @-mentions in Slack | Automatic — Event Bus + Rule Engine |
| Notify on deploy | DevOps posts in channel | Automatic — CI monitor → Event Bus → Toast |
| Developer onboarding | Wiki page + 2 hours of setup | 3 minutes — automated secrets, tools, repo setup |
| Track sprint progress | Scrum master updates board | Real-time — Task Manager syncs bidirectionally |
| Log hours | Developer fills timesheet | Automatic — timestamps on every transition |
| Write PR description | Developer writes manually | AI generates from task context + code diff |
| Run reviewer's checklist | Reviewer goes through items mentally | AI summary + interactive breakpoint review |
| Know what deployed | Check CI logs or ask DevOps | Manager Dashboard with per-version story list |

---

## Apps Used (End-to-End)

| Phase | Apps |
|-------|------|
| Company setup | Security Setup, RobOS Preferences |
| Jira + workflow config | Task Servers, Workflow Studio |
| Git project setup | Git Projects, Pass Manager |
| Requirements + stories | Task Manager (AI Breakdown) |
| Developer onboarding | Git Projects, Dev Tools, Pass Manager, Security Setup |
| Task development | Task Manager, Workspace Manager, AI Agent Manager, Dev Central |
| Code review | PR Review Board, Toast Daemon, Notifications |
| Deploy monitoring | CI Monitor, Toast Daemon |
| Dashboards | Manager Dashboard, Dev Central |
| Throughout | Event Bus (background), Work Journal (auto-capture), Toast Daemon (notifications) |
