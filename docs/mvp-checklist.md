# RobOS MVP Verification Checklist

Step-by-step proof that the Model Problem works end-to-end. Each step has a **verify** action that confirms it worked before moving on.

We use a single user (the host user) playing all roles, and GitHub Issues (not Jira) as the task server for simplicity.

---

## Phase 0: Build & Install RobOS

### 0.1 — Build the VM image
```bash
cd infra/desktop
./build.sh
```
**Verify:** `output/robos.qcow2` and `output/seed.iso` exist. Build log shows "All RobOS apps deployed."

### 0.2 — First boot with cloud-init
```bash
./run.sh --firstboot
```
**Verify:** VM boots to GNOME desktop with dark theme. Splash screen shows all 7 steps completing.

### 0.3 — SSH into VM
```bash
ssh -p 2224 robos@localhost   # password: robos
```
**Verify:** Shell prompt works.

### 0.4 — Confirm all apps deployed
```bash
ls /usr/local/share/robos/ | wc -l
ls /usr/share/applications/*.desktop | wc -l
```
**Verify:** 29+ app directories in robos/, desktop files installed.

### 0.5 — App Launcher works
Open the App Launcher (Super key or click taskbar icon). Arrow keys navigate the grid.

**Verify:** Grid shows all RobOS apps with icons. Can launch an app by pressing Enter.

---

## Phase 1: Security & First Login

### 1.1 — Security Setup wizard
Launch **Security Setup** from App Launcher.

- Step 1: Configure GPG pinentry → click "Configure Secure Dialog"
- Step 2: Create GPG key → fill name/email/passphrase → "Generate GPG Key"
- Step 3: Initialize pass store → "Initialize Pass Store"
- Step 4: Generate SSH key → "Generate SSH Key"
- Step 4b: Add to GitHub → "Add to GitHub" (may need "Re-auth gh" for scope)
- Step 5: Done

**Verify:** All 5 steps show green checkmarks. `~/.gnupg/`, `~/.password-store/`, `~/.ssh/id_ed25519` all exist.

### 1.2 — Pass Unlock works
Launch **Pass Unlock** from App Launcher.

**Verify:** Shows "Good [morning/afternoon/evening]" with date. Enter passphrase → shows "Pass unlocked for the day!"

### 1.3 — Git Login Manager healthy
Launch **Git Login Manager** from App Launcher.

**Verify:** All 4 checks show green dots:
- gh CLI authenticated ✓
- SSH key exists ✓
- SSH → github.com ✓
- git identity configured ✓ (auto-filled from GitHub profile)

### 1.4 — Pass Manager works
Launch **Pass Manager** from App Launcher.

**Verify:** Shows empty store or the initialized store. Can add a new entry (e.g., `test/secret`), view it, copy to clipboard, delete it.

---

## Phase 2: Configure Task Server

### 2.1 — Open Task Servers
Launch **Task Servers** from App Launcher.

Click "+" to add a new server:
- Type: GitHub
- Name: "Buildbarn Forms"
- Use gh CLI: checked
- Org: `Hermetiq`
- Repo: `buildbarn-forms`

Click "Save" then "Test Connection".

**Verify:** Test connection shows "Logged in as [your-username]". Server appears in sidebar.

---

## Phase 3: Configure Workflow

### 3.1 — Open Workflow Studio
Launch **Workflow Studio** from App Launcher.

Click "✨ Generate" with prompt: "agile software team, bugs + features, AI-first development"

**Verify:** AI generates issue types (Bug, Feature, etc.) with workflow states. Click "💾 Save".

---

## Phase 4: View Issues on Task Board

### 4.1 — Open Task Board
Launch **Task Board** from App Launcher.

**Verify:** Shows server name badge ("Buildbarn Forms"). Kanban view shows columns grouped by status. Issues from Hermetiq/buildbarn-forms appear as cards.

### 4.2 — Switch to list view
Click "☰ List" button.

**Verify:** Table shows issues with Key, Summary, Status, Assignee, Type, Updated columns. Click a row to open in browser.

### 4.3 — Filter
Select an assignee from the dropdown. Type a search term.

**Verify:** Board/list filters correctly.

---

## Phase 5: Issue Manager — View a Single Issue

### 5.1 — Open Issue Manager
Launch **Issue Manager** from App Launcher.

Click "⚙ Config" to verify the task server is loaded. Switch back to issue view.

**Verify:** Shows issue detail view with workflow state transitions, workspace setup button, and GitHub/VS Code links.

---

## Phase 6: AI Agent Session

### 6.1 — Open Agents Manager
Launch **Agents Manager** from App Launcher.

**Verify:** Shows provider detection — Claude Code and/or GitHub Copilot detected (or "not found" if not installed). Session list is empty.

### 6.2 — Open Context Manager
Launch **Context Manager** from App Launcher.

**Verify:** Shows context source list (empty initially). Can add a file or folder as context source.

---

## Phase 7: Code Review & CI

### 7.1 — Open PR Review Board
Launch **PR Review Board** (pr-review) from App Launcher.

**Verify:** Lists open PRs from configured repo. Each PR shows: title, author, CI status badge, review decision, +/- lines. Click a PR to see detail tabs (Overview, AI Review, Files Changed, CI Checks, Review Actions).

### 7.2 — Open CI Monitor
Launch **CI Monitor** from App Launcher.

**Verify:** Shows GitHub Actions workflow runs with status (pass/fail/running). Summary bar shows counts. Auto-refreshes every 30s.

---

## Phase 8: Notifications & Events

### 8.1 — Send a test notification via CLI
```bash
/usr/local/share/robos/robos-cli/robos-notify "Test notification" --title "MVP Test" --category system --tier info
```

**Verify:** Notification written to `~/.config/robos/notifications.json`.

### 8.2 — Open Notifications app
Launch **Notifications** from App Launcher.

**Verify:** Shows the test notification in the list with category badge and timestamp.

### 8.3 — Open Automation Studio
Launch **Automation Studio** from App Launcher.

**Verify:** Shows 3 tabs: Rules, Scheduled Jobs, Event Log. Rules tab shows default rules (CI failure, PR review, etc.) or empty state with "New Rule" button.

---

## Phase 9: Dashboards

### 9.1 — Open Dev Central
Launch **Dev Central** from App Launcher.

**Verify:** Shows developer dashboard with sections: My Tasks, My PRs, Review Requests, Blocker Radar, AI Standup, Recent Activity. Data populated from GitHub.

### 9.2 — Open Manager Dashboard
Launch **Manager Dashboard** from App Launcher.

**Verify:** Shows team metrics (open issues, PRs merged, cycle time), sprint board kanban, velocity chart, PR activity feed, deployment history.

### 9.3 — Open Deploy Tracker
Launch **Deploy Tracker** from App Launcher.

**Verify:** Shows deployment timeline, KPIs (total deploys, frequency), recent releases.

---

## Phase 10: System Services

### 10.1 — RobOS Preferences
Launch **RobOS Preferences** from App Launcher.

**Verify:** Shows settings sections (AI Provider, GitHub, IDE, Notifications, Journal, System). Can edit and save a setting.

### 10.2 — Search Index
Launch **Search Index** from App Launcher.

**Verify:** Shows index management UI. Can trigger a scan.

### 10.3 — Workspace Manager
Launch **Workspace Manager** from App Launcher.

**Verify:** Shows discovered workspaces (if any repos cloned). Filter by IDE type. Can open workspace in VS Code / JetBrains.

---

## Phase 11: Smoke Test (Automated)

### 11.1 — Run VM smoke tests for all apps
From the host machine:
```bash
cd packages/robos-test
node lib/vm-smoke.js
```

**Verify:** All apps show ✅ PASS — deployed, health check ok, DOM snapshot verified.

---

## Summary

| Phase | What | Apps Tested |
|-------|------|-------------|
| 0 | Build & install | VM, cloud-init, app launcher |
| 1 | Security | security-setup, pass-unlock, git-login-manager, pass-manager |
| 2 | Task server | task-servers |
| 3 | Workflow | workflow-studio |
| 4 | Task board | task-board |
| 5 | Issue detail | issue-manager |
| 6 | AI agents | agents-manager, context-manager |
| 7 | Code review | pr-review, ci-monitor |
| 8 | Notifications | robos-cli, notifications, automation-studio |
| 9 | Dashboards | dev-central, manager-dashboard, deploy-tracker |
| 10 | System | robos-preferences, search-index, workspace-manager |
| 11 | Automated | all apps via vm-smoke.js |
