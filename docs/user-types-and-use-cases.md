# RobOS User Types & Use Cases

## User Types

RobOS serves four distinct user types within a software engineering organization. Each interacts with different parts of the system, but all share the same AI-augmented platform.

| User Type | Primary Goal | Daily Apps |
|-----------|-------------|------------|
| **Product Owner** | Turn business needs into structured requirements | Task Manager, EKGraph, Stage Demo Viewer |
| **Developer** | Write code with AI assistance through a guided workflow | Task Manager, Workspace Manager, AI Agent Manager, Dev Tools, Git Projects |
| **Dev Lead** | Review code efficiently with AI-powered context | PR Review Board, Task Manager, CI Monitor |
| **Manager** | Track progress, deployments, and system health | Manager Dashboard, CI Monitor, Task Manager |

---

## Product Owner

### Role
Translates business needs into structured requirements that developers and AI agents can act on. Ensures quality of what goes to production by reviewing staged changes.

### Use Cases

**UC-PO-1: Create structured requirements**
> As a Product Owner, I want to create detailed, structured requirements from business needs so that developers and AI agents can reliably convert them into tasks.

- Open **Task Manager** → New Requirement
- AI assists in structuring the requirement using a rigid readiness checklist
- Readiness gates ensure the requirement has enough detail before becoming a task
- Requirements are stored in the **EKGraph** and linked to the relevant project/service
- Voice dictation available for rapid requirement capture

**UC-PO-2: AI-generated requirement processes**
> As a Product Owner, I want AI to help me generate detailed requirement documents following a standard process so that the handoff to developers is smooth.

- AI analyzes business need description and generates structured requirement
- Follows a template: problem statement, acceptance criteria, scope, dependencies, test scenarios
- PO reviews and refines — AI suggests improvements
- Final requirement published to task server

**UC-PO-3: Review staged changes via AI demo**
> As a Product Owner, I want AI to demo each product change when it reaches the staging environment so I can review it before production.

- **Stage Demo Viewer** shows new changes deployed to staging
- AI generates walkthrough: what changed, why, how to verify
- Annotated screenshots or screen recordings of the change in action
- PO approves or requests revisions — feedback flows back to the task

---

## Developer

### Role
Implements tasks with AI assistance. The entire workflow is guided — from environment setup through code review to deployment. AI agents do the heavy lifting; developers review, refine, and approve.

### Use Cases

**UC-DEV-1: Quick local environment setup**
> As a Developer, I want to quickly set up my local development environment with AI assistance so that I can start working on tasks immediately.

- Open **Workspace Manager** → pick a task
- Workspace auto-provisions: clones repo, checks out branch, installs dependencies
- AI reads the project's dev setup instructions from the **EKGraph** and runs them
- IDE launches with the workspace loaded, dev server started
- Developer is placed at the exact point where the issue reproduces (breakpoint set)

**UC-DEV-2: Transform requirements into tasks**
> As a Developer, I want to transform product requirements into detailed, comprehensive tasks so that AI agents can work on them.

- Open **Task Manager** → select a requirement
- AI breaks it down into implementation tasks: code changes, tests, config, docs
- Each task gets a defined scope, acceptance criteria, and estimated complexity
- Tasks are created in the task server (Jira/GitHub Issues)

**UC-DEV-3: AI agent implements a task**
> As a Developer, I want an AI agent to implement my task through a structured workflow so that I can focus on review rather than typing.

The task progresses through these stages automatically:

1. **Local Environment Setup** — Workspace provisioned, IDE loaded, issue reproduced
2. **AI Questionnaire** — Agent asks clarifying questions to prevent hallucinations. Developer answers via text or voice dictation
3. **AI Draft** — Agent implements the solution using task context + EKGraph + codebase
4. **Human Review** — Developer reviews the AI's work in the IDE
5. **AI Quiz** — Agent generates a small quiz to ensure the developer understands the change
6. **PR Draft Created** — Agent creates a pull request with description and test plan
7. **CI Monitoring** — CI pipeline runs; agent watches for failures
8. **AI Review-Fix Cycles** — If reviewers request changes, agent addresses feedback
9. **PR Approvals Requested** — Agent requests reviews from the right people
10. **PR Merged** — Merged after approval
11. **Deploy Monitoring** — Agent monitors the deployment pipeline

Throughout: task server status updated, hours logged, comments added automatically.

**UC-DEV-4: Use voice dictation**
> As a Developer, I want to use my voice to interact with AI text areas so that I can work faster and more naturally.

- Voice dictation available in every AI text input across all RobOS apps
- Local, offline STT (no network dependency) — streams text in real-time
- Conversations with AI are automatically converted into EKGraph knowledge nodes
- Microphone indicator shows when voice input is active

**UC-DEV-5: Capture work in journal**
> As a Developer, I want my IDE and OS activity to be automatically captured in a journal so that I have a record of what I worked on.

- **Work Journal** auto-captures: files edited, branches switched, tests run, PRs created
- IDE events and OS events written to journal entries
- Journal is git-backed and can be shared with the team
- AI generates daily summaries
- Voice notes can be added for context

**UC-DEV-6: Query the Engineering Knowledge Graph**
> As a Developer, I want to find any piece of company engineering knowledge reliably so that I don't waste time searching Slack/Confluence/wikis.

- Search **EKGraph** for: repos, services, environments, logging, monitoring, runbooks, people
- AI indexes and files new knowledge — no manual organization needed
- Everything is structured with a schema, not free-form dumping
- Context from EKGraph is automatically fed to AI agents working on tasks

---

## Dev Lead

### Role
Reviews code with AI assistance. Reviews are a first-class citizen — AI makes reviews interactive and thorough rather than just reading diffs.

### Use Cases

**UC-DL-1: AI-assisted code review**
> As a Dev Lead, I want AI to assist my code reviews by summarizing changes, flagging issues, and generating test scenarios so that I can review faster and more thoroughly.

- Open **PR Review Board** → select a PR
- AI provides: change summary, risk assessment, flagged issues, suggested improvements
- One-click: AI generates an e2e test for the change
- AI sets a breakpoint at the relevant code location in the IDE — Dev Lead can step through

**UC-DL-2: Interactive review with breakpoints**
> As a Dev Lead, I want AI to create an end-to-end test and place me at the relevant breakpoint so that I can review code hands-on, not just read diffs.

- From **PR Review Board**, click "Interactive Review"
- AI creates a test that exercises the changed code
- **Dev Tools** opens the workspace, starts the test in debug mode
- Developer lands at the breakpoint where the change is exercised
- Can step through, inspect variables, verify behavior

**UC-DL-3: Track review-fix cycles**
> As a Dev Lead, I want to track how many review-fix cycles a PR goes through so that I can identify patterns and coach the team.

- **PR Review Board** shows review round count, time-to-merge, fix quality
- AI agent automatically addresses review feedback and pushes fixes
- Dev Lead gets notified when fixes are ready for re-review

---

## Manager

### Role
Tracks progress, deployments, and system health at a high level. Uses AI to create custom reports and monitors.

### Use Cases

**UC-MGR-1: Granular task progress tracking**
> As a Manager, I want to track task progress at a granular level — by developer, by task, by deployment — so that I can identify bottlenecks.

- **Manager Dashboard** shows: tasks in progress, workflow stage distribution, stuck tasks
- Drill down: per-developer velocity, per-task timeline, per-deployment stats
- Configurable metrics — AI can create new report types on demand

**UC-MGR-2: Deployment tracking**
> As a Manager, I want to track deployments at a developer level and task level so that I know what shipped and when.

- **CI Monitor** → Deployments view
- Filter by: developer, task, project, date range
- See: what changed, who reviewed it, how long it took, any incidents

**UC-MGR-3: System health monitoring**
> As a Manager, I want to easily monitor the health of the entire system so that I can catch problems early.

- **Manager Dashboard** → Health tab
- AI creates monitors from natural language: "alert me when staging deploy takes more than 10 minutes"
- Existing monitors: CI pass rate, deploy frequency, mean time to merge, incident rate
- AI can suggest new monitors based on patterns it observes

**UC-MGR-4: AI-generated reports**
> As a Manager, I want AI to create custom reports from natural language so that I don't need to build dashboards manually.

- "Show me how many PRs each developer merged this sprint"
- "Compare deploy frequency this month vs last month"
- AI queries task server + CI data + EKGraph and generates the report
- Reports can be saved, scheduled, and shared

---

## Cross-Cutting Concerns

These capabilities span all user types:

### Voice Dictation (all users)
- Every AI text area in RobOS supports voice input
- Local, offline STT — works without internet
- Conversations become EKGraph nodes automatically

### EKGraph (all users)
- Single source of truth for all company engineering knowledge
- AI-indexed, schema-structured — not a free-form wiki
- All apps can query it for context

### RobOS Distributed Config (all users)
- Team-shared configs versioned in git
- Workflows, task server settings, AI preferences, EKGraph schema
- Sync across team members automatically

### RobOS Journal (Developers, Dev Leads)
- Auto-captured IDE/OS events
- Shareable, git-backed
- AI-generated summaries
