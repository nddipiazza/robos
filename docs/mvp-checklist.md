# RobOS MVP Manual Test Checklist

Walk through the Model Problem scenario step by step as each persona. Uses GitHub Issues (not Jira) against real repos: [Hermetiq/buildbarn-forms](https://github.com/Hermetiq/buildbarn-forms) and [Hermetiq/buildbarn-forms-proto](https://github.com/Hermetiq/buildbarn-forms-proto).

---

## Phase 0: Build & Install RobOS

- [ ] Stop the VM if running: `infra/desktop/run.sh` → Ctrl-C or close the QEMU window
- [ ] Rebuild with all packages: `infra/desktop/build.sh`
- [ ] First boot: `infra/desktop/run.sh --firstboot`
- [ ] Wait for splash screen to complete all 7 steps and VM reboots
- [ ] VM boots to GNOME desktop with dark navy background
- [ ] SSH works: `ssh -p 2224 robos@localhost` (password: `robos`)
- [ ] Verify apps installed: `ls /usr/local/share/robos/ | wc -l` → should be 29+
- [ ] Press **Super** key → App Launcher opens with icon grid

---

## Phase 1: Create Users

We'll use the single `robos` user for testing but simulate 4 roles.

### As DevManager

- [ ] SSH into VM: `ssh -p 2224 robos@localhost`
- [ ] Create config directory: `mkdir -p ~/.config/robos`
- [ ] Set identity as dev manager:
  ```bash
  cat > ~/.config/robos/settings.json << 'EOF'
  {
    "myProfileUid": "robos",
    "role": "dev-manager",
    "displayName": "DevManager"
  }
  EOF
  ```

---

## Phase 2: Security Setup (as DevManager)

- [ ] Open **App Launcher** → click **Security Setup**
- [ ] Step 1 (Pinentry): Click "Configure Secure Dialog" → status turns green
- [ ] Step 2 (GPG Key): Fill in name + email + passphrase → "Generate GPG Key" → wait for key gen
- [ ] Step 3 (Pass Store): Click "Initialize Pass Store" → status turns green
- [ ] Step 4 (SSH Key): Click "Generate SSH Key" → key appears
- [ ] Step 4b: Click "Add to GitHub" → if scope error, click "Re-auth gh →", complete in browser, then retry
- [ ] Step 5: Shows "All Set!" with key details
- [ ] Verify from terminal:
  ```bash
  gpg --list-keys          # shows your key
  ls ~/.password-store/    # shows .gpg-id
  ls ~/.ssh/id_ed25519     # SSH key exists
  ssh -T git@github.com    # "successfully authenticated"
  ```

---

## Phase 3: GitHub Auth (as DevManager)

- [ ] Open **App Launcher** → click **Git Login Manager**
- [ ] All 4 checks should be green:
  - gh CLI authenticated ✓
  - SSH key exists ✓
  - SSH → github.com ✓
  - git identity configured ✓ (should auto-fill from GitHub profile)
- [ ] If any red: use the fix buttons (Login →, Generate Key →, Configure →)

---

## Phase 4: Configure Task Server (as DevManager)

- [ ] Open **App Launcher** → click **Task Servers**
- [ ] Click the **＋** button to add a new server
- [ ] Select type: **GitHub**
- [ ] Fill in:
  - Name: `Buildbarn Forms`
  - Use gh CLI: ✓ (checked)
  - Org/Owner: `Hermetiq`
  - Repository: `buildbarn-forms`
- [ ] Click **Test Connection** → should show "Logged in as [your-username]"
- [ ] Click **Save**
- [ ] Server appears in the sidebar list

---

## Phase 5: Define Workflow (as DevManager)

- [ ] Open **App Launcher** → click **Workflow Studio**
- [ ] In the AI Generate box, type: `agile software team, bugs + features + chores, AI-first development`
- [ ] Click **✨ Generate** → wait for AI to generate issue types and workflow states
- [ ] Review the generated issue types (Bug, Feature, Chore, etc.) — each should have workflow states
- [ ] Click **💾 Save**
- [ ] Verify from terminal:
  ```bash
  cat ~/.config/robos/settings.json | python3 -m json.tool | grep -A5 "issue_types"
  ```

---

## Phase 6: View Issues on Task Board (as DevManager)

- [ ] Open **App Launcher** → click **Task Board**
- [ ] Server badge shows "Buildbarn Forms"
- [ ] Kanban view: columns grouped by issue status, cards show title + author + labels
- [ ] Click **☰ List** → table view with sortable columns
- [ ] Filter: select an assignee from dropdown → board filters
- [ ] Search: type "config" → only matching issues shown
- [ ] Click a card/row → opens issue in browser
- [ ] Press **1** → switches to kanban, **2** → switches to list

---

## Phase 7: View Single Issue (as Developer)

- [ ] Open **App Launcher** → click **Issue Manager**
- [ ] Click **⚙ Config** → verify task server loaded, then switch back
- [ ] Issue view shows:
  - GitHub link button (↗)
  - VS Code button (📂)
  - Workflow state pipeline
  - Workspace setup button (🚀)
- [ ] Click **↗ GitHub** → opens issue in browser

---

## Phase 8: Context Manager (as Developer)

- [ ] Open **App Launcher** → click **Context Manager**
- [ ] Click to add a new context source
- [ ] Add a file path: `/home/robos/projects/buildbarn-forms/README.md` (or any local file)
- [ ] Context source appears in the list with file size
- [ ] (If repo is cloned) Add the repo as a context source

---

## Phase 9: Agents Manager (as Developer)

- [ ] Open **App Launcher** → click **Agents Manager**
- [ ] Provider detection section shows:
  - Claude Code: detected / not found
  - GitHub Copilot: detected / not found
- [ ] (If an agent is installed) Try starting a session — should show session in the list

---

## Phase 10: PR Review Board (as Dev Lead)

- [ ] Open **App Launcher** → click **PR Review Board** (pr-review)
- [ ] Lists open PRs from Hermetiq/buildbarn-forms
- [ ] Each PR shows: title, author, CI status badge, review decision, +/- lines
- [ ] Click a PR → detail view with tabs:
  - **Overview**: PR description, reviewers, labels
  - **AI Review**: click to generate AI summary + risk assessment
  - **Files Changed**: file list
  - **CI Checks**: check runs
  - **Review Actions**: approve / request changes / comment buttons
- [ ] Click **Approve** or **Comment** → submits review via `gh pr review`

---

## Phase 11: CI Monitor (as Dev Lead)

- [ ] Open **App Launcher** → click **CI Monitor**
- [ ] Shows GitHub Actions workflow runs for configured repo
- [ ] Summary bar: total, passed, failed, running counts
- [ ] Click a failed run → detail view with:
  - Jobs tab: step-by-step breakdown
  - Failed Log tab: error output
  - AI Diagnosis tab: failure categorization + suggested fix
- [ ] Click **Re-run** → re-runs the workflow via `gh run rerun`

---

## Phase 12: Notifications (as any user)

### 12a: Send notification from CLI
- [ ] From terminal:
  ```bash
  /usr/local/share/robos/robos-cli/robos-notify "PR #42 needs review" \
    --title "PR Review" --category pr_review --tier warning
  ```
- [ ] Verify written:
  ```bash
  cat ~/.config/robos/notifications.json | python3 -m json.tool | tail -20
  ```

### 12b: View in Notifications app
- [ ] Open **App Launcher** → click **Notifications**
- [ ] Test notification appears with category badge (pr_review) and tier (warning)
- [ ] Filter: check/uncheck category checkboxes → list filters
- [ ] Click "Mark all read" → badges clear

---

## Phase 13: Automation Studio (as DevManager)

- [ ] Open **App Launcher** → click **Automation Studio**
- [ ] **Rules tab**: shows default rules or empty state
  - Click "New Rule" → fill in event type (e.g., `ci_completed`), add condition (`payload.status` eq `failure`), add action (notify, tier: critical)
  - Save the rule
- [ ] **Scheduled Jobs tab**: shows empty or pre-configured jobs
  - Can create a job with a cron schedule
- [ ] **Event Log tab**: shows today's events (if any) or empty state

---

## Phase 14: Dashboards (as DevManager / Dev Lead)

### 14a: Dev Central (Developer view)
- [ ] Open **App Launcher** → click **Dev Central**
- [ ] Shows: My Tasks, My PRs, Review Requests, Blocker Radar
- [ ] AI Standup section shows summary of recent activity
- [ ] Recent Activity shows latest events

### 14b: Manager Dashboard (Manager view)
- [ ] Open **App Launcher** → click **Manager Dashboard**
- [ ] Shows team metrics: Open Issues, PRs Merged, Cycle Time
- [ ] Sprint board shows issues in kanban columns
- [ ] Velocity chart shows per-developer bars
- [ ] Deployment history table lists recent deploys

### 14c: Deploy Tracker
- [ ] Open **App Launcher** → click **Deploy Tracker**
- [ ] Shows deployment timeline from GitHub
- [ ] KPIs: Total Deploys, Frequency, Releases

---

## Phase 15: System Apps

### 15a: RobOS Preferences
- [ ] Open **App Launcher** → click **RobOS Preferences**
- [ ] 6 sections in sidebar: AI Provider, GitHub, IDE, Notifications, Journal, System
- [ ] Click a section → settings form appears
- [ ] Change a value → click Save → reopen and verify it persisted

### 15b: Workspace Manager
- [ ] Open **App Launcher** → click **Workspace Manager**
- [ ] Click **Scan** → discovers workspaces (if any repos cloned under ~/projects or ~/source)
- [ ] Filter by IDE type (VS Code / JetBrains)
- [ ] Click a workspace → shows git branch, remote, changed files

### 15c: Search Index
- [ ] Open **App Launcher** → click **Search Index**
- [ ] Shows index management UI
- [ ] Click to add a custom index path → trigger rebuild

---

## Phase 16: Automated Smoke Test

From the **host machine** (not inside the VM):

```bash
cd packages/robos-test
node lib/vm-smoke.js
```

- [ ] All apps show ✅ PASS with DOM snapshot preview
- [ ] No ❌ FAIL entries

---

## Results Summary

| Phase | Persona | What Tested | Pass? |
|-------|---------|-------------|-------|
| 0 | — | VM build, install, boot | |
| 1 | DevManager | User creation | |
| 2 | DevManager | GPG + SSH + pass store | |
| 3 | DevManager | GitHub authentication | |
| 4 | DevManager | Task server config (GitHub) | |
| 5 | DevManager | Workflow definition (AI generate) | |
| 6 | DevManager | Task board (kanban + list) | |
| 7 | Developer | Single issue view + transitions | |
| 8 | Developer | Context curation | |
| 9 | Developer | AI agent session setup | |
| 10 | Dev Lead | PR review with AI summary | |
| 11 | Dev Lead | CI monitoring + AI diagnosis | |
| 12 | Any | Notifications (CLI + app) | |
| 13 | DevManager | Event rules + scheduling | |
| 14 | All | Dashboards (dev, manager, deploy) | |
| 15 | Any | Preferences, workspaces, search | |
| 16 | — | Automated smoke (all apps) | |
