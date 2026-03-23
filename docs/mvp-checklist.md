# RobOS MVP Manual Test Checklist

Prove the Model Problem works: a developer picks up a story and drives it from backlog to deployed, with every status transition, notification, and dashboard update happening automatically.

Uses GitHub Issues against [Hermetiq/buildbarn-forms](https://github.com/Hermetiq/buildbarn-forms).

---

## Setup Phases (do once)

### Phase 0: Build & Install RobOS

- [ ] Stop VM if running
- [ ] Rebuild: `infra/desktop/build.sh`
- [ ] First boot: `infra/desktop/run.sh --firstboot`
- [ ] Wait for 7-step splash to complete + reboot
- [ ] SSH works: `ssh -p 2224 robos@localhost` (password: `robos`)
- [ ] `ls /usr/local/share/robos/ | wc -l` → 29+
- [ ] Super key opens App Launcher with icon grid + arrow key navigation

### Phase 1: Security Setup

- [ ] Open **Security Setup** → complete all 5 steps (pinentry → GPG key → pass store → SSH key → add to GitHub)
- [ ] Open **Git Login Manager** → all 4 checks green (gh auth, SSH key, SSH → github.com, git identity)
- [ ] Verify: `ssh -T git@github.com` → "successfully authenticated"

### Phase 2: Configure Task Server

- [ ] Open **Task Servers** → click ＋ → type: GitHub, name: `Buildbarn Forms`, org: `Hermetiq`, repo: `buildbarn-forms`, use gh CLI ✓
- [ ] Test Connection → "Logged in as [username]"
- [ ] Save

### Phase 3: Define Workflow

- [ ] Open **Workflow Studio** → AI Generate: `agile software team, bugs + features, AI-first development` → ✨ Generate → 💾 Save
- [ ] Verify workflow states exist: `cat ~/.config/robos/settings.json | python3 -m json.tool | grep -c "states"`

---

## Core Flow: Developer Progresses a Story

This is the MVP's core value proposition. A developer takes a story from backlog through every stage to deployed.

### Phase 4: View the Board & Pick Up a Story

- [ ] Open **Task Board** → kanban view shows issues from buildbarn-forms
- [ ] Find a story/issue in the "open" column
- [ ] Note the issue number (e.g., `#42`) and title
- [ ] Click the card → opens in browser, confirm it exists on GitHub

### Phase 5: Start Work (Backlog → In Progress)

- [ ] Open **Issue Manager**
- [ ] Load the issue (enter the issue number or select from list)
- [ ] Issue detail shows: title, description, labels, workflow state pipeline
- [ ] Click the workflow transition to move to **In Progress** (adds `state:in-progress` label)
- [ ] Verify on GitHub: issue now has `state:in-progress` label
- [ ] Open **Task Board** → issue moved to the "in-progress" column

### Phase 6: Set Up Workspace

- [ ] In **Issue Manager**, click **🚀 Set Up Workspace**
- [ ] Workspace provisions: repo cloned, branch created (e.g., `feat/42-worker-config`)
- [ ] Open **Workspace Manager** → new workspace appears in the list
- [ ] Click to open in VS Code / IDE

### Phase 7: AI Questionnaire Stage

- [ ] Open **Agents Manager** → verify Claude Code or Copilot is detected
- [ ] Start an agent session for this task
- [ ] Agent asks clarifying questions about the implementation
- [ ] Answer the questions in the session UI
- [ ] Agent acknowledges answers and is ready to draft

### Phase 8: AI Draft Stage (In Progress → In Review)

- [ ] Agent implements the solution (writes code, tests, etc.)
- [ ] Agent creates a PR: `gh pr create --title "feat: ..." --body "..."`
- [ ] Verify on GitHub: PR exists with description and linked issue
- [ ] Issue automatically transitions to **In Review** (PR creation triggers status change)
- [ ] Open **Task Board** → issue moved to "in-review" column
- [ ] **Notification** fires: Dev Lead gets "PR needs review" notification
- [ ] Open **Notifications** app → notification appears with `pr_review` category

### Phase 9: Code Review (In Review → Approved)

- [ ] Open **PR Review Board** → new PR appears in the list
- [ ] Click PR → detail view shows:
  - Overview with PR description
  - AI Review: click generate → shows change summary, risk assessment, findings
  - Files Changed: list of modified files
  - CI Checks: GitHub Actions status
- [ ] Click **Approve** (or leave a review comment)
- [ ] Verify on GitHub: PR has approval
- [ ] Issue automatically transitions to **Approved**
- [ ] Open **Task Board** → issue moved to "approved" column
- [ ] **Notification** fires: developer gets "PR approved" notification

### Phase 10: CI Monitoring

- [ ] Open **CI Monitor** → shows the CI run for this PR
- [ ] Summary bar shows pass/fail counts
- [ ] Click the run → Jobs tab shows step breakdown
- [ ] If CI fails: AI Diagnosis tab shows failure category + suggested fix
- [ ] If CI passes: green status badge

### Phase 11: Merge & Deploy (Approved → Deploying → Deployed)

- [ ] Merge the PR on GitHub (or via PR Review Board if merge button available)
- [ ] Issue automatically transitions to **Deploying** (PR merged triggers transition)
- [ ] CI/CD pipeline runs (deploy step)
- [ ] Issue automatically transitions to **Deployed** (deploy complete triggers transition)
- [ ] **Notification** fires to all stakeholders: "Deploy complete"
- [ ] Open **Task Board** → issue in "deployed" column
- [ ] Verify on GitHub: issue has `state:deployed` label, all previous state labels removed

### Phase 12: DevManager Reviews Progress (throughout)

At any point during Phases 5-11, the DevManager can see real-time progress:

- [ ] Open **Task Board** → watch the story card move through columns as transitions happen:
  - open → in-progress → in-review → approved → deploying → deployed
- [ ] Open **Manager Dashboard** →
  - Sprint board shows the story in its current stage
  - Open Issues / PRs Merged counts update
  - PR activity feed shows the new PR when created
  - Velocity chart updates when story is completed
- [ ] Open **CI Monitor** → see the CI runs for the developer's PR
- [ ] Open **PR Review Board** → see the PR, review it, approve/request changes
- [ ] **Notifications** arrive at each milestone:
  - "PR created" when developer's agent opens the PR
  - "CI passed/failed" when pipeline completes
  - "Deploy complete" when merged and deployed

### Phase 13: ProductManager Sees Completed Work

After the story reaches "deployed":

- [ ] Open **Task Board** → story is in "deployed" column ✓
- [ ] Open **Dev Central** → story appears in "Recently Deployed" or completed section
- [ ] Open **Deploy Tracker** →
  - New deployment appears in timeline with story details
  - KPIs updated: total deploys, deploy frequency
- [ ] Open **Manager Dashboard** →
  - Sprint board shows story as done
  - Velocity chart shows the completed story point
  - Deployment history table has the new deploy
- [ ] **Notification** received: "Deploy complete — [story title] shipped in v1.x.x"
- [ ] Open **Stage Demo** (if applicable) → can generate a demo walkthrough of the merged changes for PO review

### Phase 14: Verify the Full Audit Trail

- [ ] Check GitHub issue: full auto-comment history:
  - `[RobOS] Status changed: backlog → in_progress`
  - `[RobOS] PR https://github.com/... created`
  - `[RobOS] Status changed: in_progress → in_review`
  - `[RobOS] Status changed: in_review → approved`
  - `[RobOS] Status changed: approved → deploying`
  - `[RobOS] Deployed to production (v1.x.x)`
  - `[RobOS] ⏱ Logged Xh in in_progress`
- [ ] All `state:` labels on GitHub reflect final state (`state:deployed`)
- [ ] No manual Jira/GitHub status updates were needed — all automatic

---

## Supporting Features (verify alongside core flow)

### Notifications

- [ ] Send test notification from CLI:
  ```bash
  /usr/local/share/robos/robos-cli/robos-notify "Build passed" --category ci_cd --tier info
  ```
- [ ] Open **Notifications** → notification appears with category badge
- [ ] Filter by category → filters work

### Automation Studio

- [ ] Open **Automation Studio** → Rules tab
- [ ] Create a rule: event `ci_completed`, condition `payload.status eq failure`, action: notify (tier: critical)
- [ ] Save → rule appears in list
- [ ] Event Log tab → shows recent events (if any)

### Context Manager

- [ ] Open **Context Manager** → add the buildbarn-forms repo as a context source
- [ ] Shows file count and estimated token size

### System Apps

- [ ] Open **RobOS Preferences** → change a setting → save → reopen → persisted
- [ ] Open **Workspace Manager** → scan → shows discovered workspaces
- [ ] Open **Search Index** → trigger a scan

---

## Automated Verification

From the **host machine**:

```bash
cd packages/robos-test
node lib/vm-smoke.js
```

- [ ] All apps show ✅ PASS

---

## Results

| Step | Who | What Happened | Pass? |
|------|-----|--------------|-------|
| Setup: VM install | — | All apps deployed, desktop boots | |
| Setup: Security | DevManager | GPG + SSH + pass + git auth all green | |
| Setup: Task server | DevManager | GitHub connected, test passes | |
| Setup: Workflow | DevManager | AI generated issue types + states | |
| **Pick up story** | Developer | Task Board shows issues, selected one | |
| **Start work** | Developer | Issue → In Progress, label on GitHub | |
| **Workspace** | Developer | Repo cloned, branch created, IDE opens | |
| **AI questionnaire** | Developer | Agent asks questions, developer answers | |
| **AI draft + PR** | Developer | Code written, PR created, issue → In Review auto | |
| **DevManager sees PR** | DevManager | PR Review Board + notification | |
| **Code review** | DevManager | AI summary, approved in PR Review Board | |
| **CI passes** | DevManager | CI Monitor green, issue → Approved auto | |
| **Merge + deploy** | Developer | PR merged, issue → Deploying → Deployed auto | |
| **Deploy notification** | All | DevManager + ProductManager notified | |
| **ProductManager views** | ProductManager | Deploy Tracker + Manager Dashboard updated | |
| **Audit trail** | — | Full auto-comment trail on GitHub issue | |
| Automated smoke | — | All apps ✅ PASS | |
