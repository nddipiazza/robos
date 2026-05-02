---
title: "Phase 1: Setup"
layout: default
parent: The Model Problem
nav_order: 1
---

# Phase 1: Company & Environment Setup
{: .no_toc }

Dana (Dev Manager) provisions the team and configures the development infrastructure. This phase is captured in **five published videos** (01–05) — each linked from the corresponding section below.
{: .fs-6 .fw-300 }

## Table of contents
{: .no_toc .text-delta }

1. TOC
{:toc}

---

## Cast of users

Each role logs in as a separate Linux user on the same RobOS VM. Each user has their own RobOS desktop login, `~/.config/robos/` profile, and GPG/SSH keys (initialized via the **Security Setup** app on first login).

| User | Login | Role in RobOS |
|:-----|:------|:--------------|
| Dana | `dana@acme` | Manager — dashboards, workflow config, task server admin |
| Pat | `pat@acme` | Product Owner — requirements, epic/story creation, staging review |
| Jordan | `jordan@acme` | Dev Lead — code review, architecture decisions, PR approvals |
| Alex | `alex@acme` | Developer — task implementation, AI-assisted coding |

---

## 1.1 — Dana sets up RobOS for Acme

<img src="{{ '/assets/images/icons/task-servers.svg' | relative_url }}" alt="Task Servers" style="width: 32px; height: 32px; vertical-align: middle;"> **Apps:** Task Servers · Workflow Studio · Git Projects · RobOS Preferences

📺 **[Video 01 — Dana sets up RobOS for Acme]({{ site.baseurl }}{% link model-problem/videos/01-dana-setup.md %})**

<div style="position: relative; padding-bottom: 56.25%; height: 0; overflow: hidden; max-width: 100%; margin: 1rem 0; border-radius: 8px;">
  <iframe
    src="https://www.youtube-nocookie.com/embed/jB1YQYEA-jA"
    title="RobOS Model Problem · 01 — Dana sets up RobOS for Acme"
    frameborder="0"
    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
    allowfullscreen
    style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; border-radius: 8px;"></iframe>
</div>

In one sitting, Dana hooks RobOS up to Jira, designs the workflow every ticket will follow, and registers the two repos the team will work on.

### Jira (Task Servers)

📺 **Deep-dive:** [Dana — Task Servers (Jira via Pass Manager)](https://youtu.be/vygBUoocpbg)

<div style="position: relative; padding-bottom: 56.25%; height: 0; overflow: hidden; max-width: 100%; margin: 1rem 0; border-radius: 8px;">
  <iframe
    src="https://www.youtube-nocookie.com/embed/vygBUoocpbg"
    title="RobOS Model Problem · Dana — Task Servers"
    frameborder="0"
    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
    allowfullscreen
    style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; border-radius: 8px;"></iframe>
</div>

Dana opens **Task Servers** and configures Jira as the team's task tracking system:

1. **Stash the API token in Pass Manager** — credentials never live in plain-text config
2. **Add connection** — Jira Cloud instance `acme.atlassian.net`
3. **Reference the pass entry by path** — Task Servers reads the token directly from the password store
4. **Project keys** — list the keys (e.g. `KAN`) the team uses, so RobOS can enumerate them
5. **Test the connection**, then **Save**

Initial sync pulls all existing Jira issues into RobOS. Bidirectional sync stays enabled. Every other RobOS app — Issue Manager, Task Board, Dev Central, PR Review, Manager Dashboard — reads from this one task server.

| Jira Status | RobOS Stage |
|:------------|:------------|
| To Do | `backlog` |
| In Progress | `in_progress` |
| In Review | `in_review` |
| Deploying | `deploying` |
| Done | `deployed` |

### Repos (Git Projects)

Dana adds the two repositories the team will work on:

| Repository | Purpose |
|:-----------|:--------|
| `buildbarn-forms` | React + TypeScript component library — parses proto schemas and generates validated configuration forms |
| `buildbarn-forms-proto` | Protobuf definitions for all Buildbarn configuration messages (worker, storage, scheduler, browser) |

Each repo carries a `ROBOS.md` that tells AI agents and the onboarding system how to set up, build, and test the project:

```markdown
# ROBOS.md — buildbarn-forms

## Prerequisites
- Node.js 20+
- protoc (protobuf compiler) 25+
- GitHub CLI (gh) authenticated

## Local Dev Setup
1. npm install
2. npm run proto:generate
3. npm run dev    # Start Storybook on :6006

## Test
npm test         # Jest unit tests
npm run test:e2e # Playwright component tests
```

---

## 1.2 — Dana installs the team toolchain

<img src="{{ '/assets/images/icons/dev-tools.svg' | relative_url }}" alt="Dev Tools" style="width: 32px; height: 32px; vertical-align: middle;"> **App:** Dev Tools

📺 **[Video 02 — Dana installs the team toolchain]({{ site.baseurl }}{% link model-problem/videos/02-dana-dev-tools.md %})**

<div style="position: relative; padding-bottom: 56.25%; height: 0; overflow: hidden; max-width: 100%; margin: 1rem 0; border-radius: 8px;">
  <iframe
    src="https://www.youtube-nocookie.com/embed/0QWB7I5e9Mw"
    title="RobOS Model Problem · 02 — Dana installs the team toolchain"
    frameborder="0"
    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
    allowfullscreen
    style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; border-radius: 8px;"></iframe>
</div>

Before Dana can authenticate agents or use any AI feature, the CLI tools must be in place. Dev Tools is RobOS's package-style installer for developer software: pick what the team needs, it gets staged centrally, and every workspace inherits the same versions. **This step unblocks 1.3 (Agents) which unblocks every AI-powered step that follows.**

---

## 1.3 — Dana configures RobOS Agents

<img src="{{ '/assets/images/icons/agents-manager.svg' | relative_url }}" alt="Agents Manager" style="width: 32px; height: 32px; vertical-align: middle;"> **App:** Agents Manager

📺 **[Video 03 — Dana configures RobOS Agents]({{ site.baseurl }}{% link model-problem/videos/03-dana-robos-agents.md %})**

<div style="position: relative; padding-bottom: 56.25%; height: 0; overflow: hidden; max-width: 100%; margin: 1rem 0; border-radius: 8px;">
  <iframe
    src="https://www.youtube-nocookie.com/embed/ZubntVBA6Pw"
    title="RobOS Model Problem · 03 — Dana configures RobOS Agents"
    frameborder="0"
    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
    allowfullscreen
    style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; border-radius: 8px;"></iframe>
</div>

Dev tools are installed. Now RobOS needs an active AI agent before Dana can use any AI-powered feature — including the AI textareas in People Manager and Group Manager. Dana opens Agents Manager, logs in to GitHub Copilot, explores session management and custom CLI parameters, and pins Copilot as the **default AI Agent** for the team.

**Steps:**

1. Open App Launcher → **Agents Manager** — GitHub Copilot shows not logged in; Codex and Claude are already authenticated.
2. **Login** to GitHub Copilot via the Agents panel.
3. Open a **Copilot terminal** and show session resume and custom CLI parameters.
4. Name the session **"Dana's Session"** to demonstrate named sessions.
5. Set **GitHub Copilot as the default AI Agent** — every AI textarea in RobOS now routes through it.

Every AI-powered feature — People Manager, Group Manager, Issue Manager, Workflow Studio, Git Projects, Dev Central — is now active for the whole team. **This step blocks every later episode.**

---

## 1.4 — Dana sets up People Manager

<img src="{{ '/assets/images/icons/people-directory.svg' | relative_url }}" alt="People Manager" style="width: 32px; height: 32px; vertical-align: middle;"> **App:** People Manager

📺 **[Video 04 — Dana sets up People Manager]({{ site.baseurl }}{% link model-problem/videos/04-dana-people-manager.md %})**

<div style="position: relative; padding-bottom: 56.25%; height: 0; overflow: hidden; max-width: 100%; margin: 1rem 0; border-radius: 8px;">
  <iframe
    src="https://www.youtube-nocookie.com/embed/ZdvQwFQwwbg"
    title="RobOS Model Problem · 04 — Dana sets up People Manager"
    frameborder="0"
    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
    allowfullscreen
    style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; border-radius: 8px;"></iframe>
</div>

People Manager is where every RobOS user gets created — name, email, role, GitHub login, the "this is me" marker. The hero feature: an AI textarea that creates one or more users from a plain-English prompt or an at-mentioned external file (a roster, a contractor list, an org chart).

Dana drops the team roster into the AI prompt and gets every user from the document created in one shot.

---

## 1.5 — Dana sets up Group Manager

<img src="{{ '/assets/images/icons/group-manager.svg' | relative_url }}" alt="Group Manager" style="width: 32px; height: 32px; vertical-align: middle;"> **App:** Group Manager

📺 **[Video 05 — Dana sets up Group Manager]({{ site.baseurl }}{% link model-problem/videos/05-dana-group-manager.md %})**

<div style="position: relative; padding-bottom: 56.25%; height: 0; overflow: hidden; max-width: 100%; margin: 1rem 0; border-radius: 8px;">
  <iframe
    src="https://www.youtube-nocookie.com/embed/mxnPjiJ0G8I"
    title="RobOS Model Problem · 05 — Dana sets up Group Manager"
    frameborder="0"
    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
    allowfullscreen
    style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; border-radius: 8px;"></iframe>
</div>

Group Manager owns the developer side of every team:

- **Git Projects** — which repos a group owns
- **Software Installations** — toolchains per group
- **Onboarding steps** — the AI's runbook for new joiners
- **Secrets** — per-group credential vault (`GITHUB_TOKEN`, `NPM_TOKEN`, `JIRA_API_TOKEN`)
- **CI management** — environments visible in RobOS CI
- **Members** — who's on the team and what role
- **Workspaces** — RobOS Workspaces owned by the group

Same hero pattern as People Manager: an AI textarea drafts a whole group — repos, members, software, onboarding steps — from a prompt or an @-mentioned external file.

---

## 1.6 — Dana defines the task workflow

<img src="{{ '/assets/images/icons/workflow-studio.svg' | relative_url }}" alt="Workflow Studio" style="width: 32px; height: 32px; vertical-align: middle;"> **App:** Workflow Studio

📺 **Deep-dive:** [Dana — Workflow Studio (AI-generated issue types & state actions)](https://youtu.be/FzUQs7tWkOo)

<div style="position: relative; padding-bottom: 56.25%; height: 0; overflow: hidden; max-width: 100%; margin: 1rem 0; border-radius: 8px;">
  <iframe
    src="https://www.youtube-nocookie.com/embed/FzUQs7tWkOo"
    title="RobOS Model Problem · Dana — Workflow Studio"
    frameborder="0"
    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
    allowfullscreen
    style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; border-radius: 8px;"></iframe>
</div>

Dana defines the workflow every issue in the project will run through. Every state has an **AI prompt** and a **shell command** that fire the moment an issue enters that state — so the workflow doesn't just track work, it drives an AI agent to do the work. Transitions move the issue forward as the agent (or a human) marks each step complete.

### Issue types

Six types, each with its own workflow, generated by the AI Generate textarea from a single description of the team:

| ID | Label | Color |
|:---|:------|:-----:|
| `bug` | Bug | <span style="display:inline-block;width:12px;height:12px;background:#D73A4A;border-radius:2px;vertical-align:middle"></span> `#D73A4A` |
| `feature-request` | Feature Request | <span style="display:inline-block;width:12px;height:12px;background:#A2EEEF;border-radius:2px;vertical-align:middle"></span> `#A2EEEF` |
| `chore` | Chore | <span style="display:inline-block;width:12px;height:12px;background:#CFD3D7;border-radius:2px;vertical-align:middle"></span> `#CFD3D7` |
| `security-issue` | Security Issue | <span style="display:inline-block;width:12px;height:12px;background:#B60205;border-radius:2px;vertical-align:middle"></span> `#B60205` |
| `performance-issue` | Performance Issue | <span style="display:inline-block;width:12px;height:12px;background:#FBCA04;border-radius:2px;vertical-align:middle"></span> `#FBCA04` |
| `question` | Question | <span style="display:inline-block;width:12px;height:12px;background:#5319E7;border-radius:2px;vertical-align:middle"></span> `#5319E7` |

### Bug workflow (representative)

The Bug workflow has 8 states. Every state's `on_enter_prompt` is a self-contained instruction the AI agent runs on entry; the `on_enter_script` is a shell command that runs alongside it. The agent stays in the state until it (or a human) advances the issue:

```yaml
type: bug
states:
  - id: ai-triage
    label: AI Triage
    is_initial: true
    on_enter_prompt: |
      Review GitHub issue #{number} in {org}/{repo}; read the full issue,
      comments, labels, recent commits, and linked PRs, inspect likely
      files in VS Code, reproduce the symptom if possible, then post a
      triage comment with severity, suspected root cause, and the
      investigation plan.
    on_enter_script: gh issue view {number} --repo {org}/{repo} --comments

  - id: ai-investigation
    label: AI Investigation
    on_enter_prompt: |
      Trace the execution path in VS Code, read tests, logs, and blame
      history, compare expected vs actual behavior, identify the smallest
      reliable fix, and update the issue with a hypothesis, impacted
      components, and acceptance criteria.

  - id: workspace-setup
    label: Workspace Setup
    on_enter_prompt: |
      Set up a local workspace for issue #{number} — clone or update
      {org}/{repo}, create a dedicated branch, open in VS Code, restore
      dependencies, and confirm the bug reproduces locally.
    on_enter_script: |
      gh repo clone {org}/{repo} repo-{number} || true \
      && cd repo-{number} && git fetch --all --prune \
      && git checkout -B ai/issue-{number} && code -r .

  - id: ai-draft
    label: AI Draft
    on_enter_prompt: |
      Implement the smallest correct fix in the branch, touching only
      relevant code paths, preserving behavior outside the defect, and
      preparing a clean diff for review.
    on_enter_script: cd repo-{number} && code -r .

  - id: ai-testing
    label: AI Testing
    on_enter_prompt: |
      Write or extend automated tests that fail before the fix and pass
      after it, run the project's test commands, capture evidence for
      GitHub, and tighten the fix if checks reveal gaps.
    on_enter_script: |
      cd repo-{number} && \
      if [ -f package.json ]; then npm test || npm run test; \
      elif [ -f go.mod ]; then go test ./...; \
      elif [ -f Cargo.toml ]; then cargo test; \
      else pytest; fi

  - id: ai-pr-creation
    label: AI PR Creation
    on_enter_prompt: |
      Push the branch, open or update a GitHub PR for issue #{number},
      summarize bug, root cause, fix, and tests, request reviewers, and
      link the PR back to the issue.
    on_enter_script: |
      cd repo-{number} && git push -u origin ai/issue-{number} \
      && gh pr create --repo {org}/{repo} --fill \
         --head ai/issue-{number} --body 'Closes #{number}'

  - id: code-review
    label: Code Review
    on_enter_prompt: |
      Monitor GitHub review comments and check runs, apply precise
      follow-up commits in VS Code, rerun focused tests, and respond to
      each thread with the exact fix or rationale.
    on_enter_script: |
      cd repo-{number} && gh pr status --repo {org}/{repo} \
      && gh pr checks --repo {org}/{repo}

  - id: done
    label: Done
    on_enter_prompt: |
      Confirm the merged PR fully addresses issue #{number}, ensure
      labels and changelog notes are accurate, close the issue if
      policy allows, and leave a short completion summary.
    on_enter_script: |
      gh issue close {number} --repo {org}/{repo} \
        --comment 'Resolved by the linked PR.' || true

transitions:
  - { from: ai-triage,        to: ai-investigation }
  - { from: ai-investigation, to: workspace-setup }
  - { from: workspace-setup,  to: ai-draft }
  - { from: ai-draft,         to: ai-testing }
  - { from: ai-testing,       to: ai-draft }       # fix failing tests
  - { from: ai-testing,       to: ai-pr-creation }
  - { from: ai-pr-creation,   to: code-review }
  - { from: code-review,      to: ai-draft }       # respond to review
  - { from: code-review,      to: done }
```

```mermaid
%%{init: {'theme': 'dark'}}%%
graph LR
    A[AI Triage] --> B[AI Investigation]
    B --> C[Workspace Setup]
    C --> D[AI Draft]
    D --> E[AI Testing]
    E -->|tests fail| D
    E -->|tests pass| F[AI PR Creation]
    F --> G[Code Review]
    G -->|changes asked| D
    G -->|approved| H[Done]
    style A fill:#BFD4F2,stroke:#7c93b8,color:#0d1117
    style B fill:#C5DEF5,stroke:#7c93b8,color:#0d1117
    style C fill:#F9E2AF,stroke:#b8a073,color:#0d1117
    style D fill:#B7E1CD,stroke:#73a895,color:#0d1117
    style E fill:#C9E8FF,stroke:#7c93b8,color:#0d1117
    style F fill:#D4C5F9,stroke:#9583c0,color:#0d1117
    style G fill:#FFD8A8,stroke:#c0966b,color:#0d1117
    style H fill:#2DA44E,stroke:#1a6630,color:#fff
```

### The other five workflows

`feature-request`, `chore`, `security-issue`, `performance-issue`, and `question` follow the same AI-driven pattern with type-specific tweaks:

- **Feature Request** — adds a `human-review` gate after `ai-investigation` (a maintainer must approve scope before the agent starts coding)
- **Chore** — skips `ai-investigation` (small surface, agent goes from triage straight to workspace setup)
- **Security Issue** — branches as `ai/security-{number}` instead of `ai/issue-{number}`; prompts emphasize confidentiality and minimum surface area
- **Performance Issue** — prompts focus on profiling baselines, measured improvement, and benchmark evidence
- **Question** — terminates at `ai-draft` → `human-review` → `done`; no PR, the agent just writes a verified answer

Each workflow's full state list and prompts are saved in `~/.config/robos/settings.json` under `task_servers[*].workflows[]`. Re-open Workflow Studio any time to expand a type and tune its prompts.

This is the **last** thing Dana does in Phase 1: it codifies the contract every later step enforces. Pat's stories (Phase 2) get authored against these types, Jordan's CI gates fire transitions, and Alex's task workspaces auto-provision the moment a ticket lands in `workspace-setup`.

---

## What's next

With Phase 1 complete, RobOS knows the people, the groups, the repos, the workflow, the AI agent, and the toolchain. Pat takes over in **[Phase 2: Requirements]({{ site.baseurl }}{% link model-problem/requirements.md %})** to break the rewrite into ten engineering stories.

For the full 20-episode video series — Pat's epic breakdown, Jordan's CI/CD setup, Alex's onboarding, and the ten engineering phases — see the **[Video Production Plan]({{ site.baseurl }}{% link model-problem/video-plan.md %})**.
