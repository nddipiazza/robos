# RobOS Model Flow

This document provides a comprehensive visual reference for the RobOS model flow — the end-to-end system that automates the Software Delivery Lifecycle using event-driven workflows, AI agents, and role-based dashboards.

The model flow is the core design that every RobOS feature serves. Each diagram below shows a different view of the same system.

---

## 1. High-Level System Flow

The complete lifecycle from requirements through deployment, showing how the four user roles interact with RobOS.

```mermaid
flowchart TB
    subgraph PO["Product Owner"]
        PO1[Define Requirements]
        PO2[AI Story Breakdown]
        PO3[Review Staged Changes]
    end

    subgraph DEV["Developer"]
        DEV1[Pick Up Task]
        DEV2[AI Questionnaire]
        DEV3[AI Draft Implementation]
        DEV4[Human Review of Draft]
        DEV5[AI Quiz]
        DEV6[Create PR]
    end

    subgraph DL["Dev Lead"]
        DL1[AI-Assisted Code Review]
        DL2[Interactive Breakpoint Review]
        DL3[Approve / Request Changes]
    end

    subgraph MGR["Manager"]
        MGR1[Sprint Progress Dashboard]
        MGR2[Deployment Tracker]
        MGR3[Velocity & Metrics]
    end

    PO1 --> PO2
    PO2 --> DEV1
    DEV1 --> DEV2 --> DEV3 --> DEV4 --> DEV5 --> DEV6
    DEV6 --> DL1 --> DL2 --> DL3
    DL3 -->|Changes Requested| DEV4
    DL3 -->|Approved| MERGE[Merge & Deploy]
    MERGE --> PO3
    MERGE --> MGR2

    DEV1 -.-> MGR1
    DEV6 -.-> MGR1
    MERGE -.-> MGR3

    classDef po fill:#1a2744,stroke:#58a6ff,color:#58a6ff
    classDef dev fill:#1a3a1a,stroke:#2ea043,color:#2ea043
    classDef dl fill:#2a1a3a,stroke:#bc8cff,color:#bc8cff
    classDef mgr fill:#3a2a1a,stroke:#f0883e,color:#f0883e
    classDef action fill:#1a3a3a,stroke:#3fb950,color:#3fb950

    class PO1,PO2,PO3 po
    class DEV1,DEV2,DEV3,DEV4,DEV5,DEV6 dev
    class DL1,DL2,DL3 dl
    class MGR1,MGR2,MGR3 mgr
    class MERGE action
```

---

## 2. Work Item Hierarchy & Lifecycle

RobOS manages four work item types, each with a distinct lifecycle. Items nest: Releases contain Epics, Epics contain Stories and Bugs.

```mermaid
flowchart LR
    subgraph Release["Release Flow"]
        R1[Planning] --> R2[Development] --> R3[Code Freeze] --> R4[QA / Staging] --> R5[Release Candidate] --> R6[Production] --> R7[Retrospective]
    end

    subgraph Epic["Epic Flow"]
        E1[Draft] --> E2[Ready] --> E3[In Progress] --> E4[Done]
    end

    subgraph Story["Story / Task Flow"]
        S1[Backlog] --> S2[In Progress] --> S3[In Review] --> S4[Approved] --> S5[Deploying] --> S6[Deployed]
    end

    subgraph Bug["Bug Flow"]
        B1[Triage] --> B2[In Progress] --> B3[In Review] --> B4[Approved] --> B5[Deploying] --> B6[Deployed]
    end

    Release -.->|contains| Epic
    Epic -.->|contains| Story
    Epic -.->|contains| Bug

    classDef release fill:#3a1a2a,stroke:#f778ba,color:#f778ba
    classDef epic fill:#2a1a3a,stroke:#bc8cff,color:#bc8cff
    classDef story fill:#1a3a1a,stroke:#2ea043,color:#2ea043
    classDef bug fill:#3a2a1a,stroke:#f0883e,color:#f0883e

    class R1,R2,R3,R4,R5,R6,R7 release
    class E1,E2,E3,E4 epic
    class S1,S2,S3,S4,S5,S6 story
    class B1,B2,B3,B4,B5,B6 bug
```

---

## 3. AI-Assisted Task Workflow (Detail)

The core developer workflow — from picking up a task to deployment. This is the heart of the model flow.

```mermaid
stateDiagram-v2
    [*] --> Backlog

    Backlog --> EnvironmentSetup: Developer clicks "Start Work"
    note right of EnvironmentSetup
        Auto-provisions workspace:
        clone, branch, install, start dev server
        IDE opens at relevant code
    end note

    EnvironmentSetup --> AIQuestionnaire: Workspace ready

    state AIQuestionnaire {
        [*] --> AgentAsksQuestions
        AgentAsksQuestions --> DeveloperAnswers
        DeveloperAnswers --> AgentAsksQuestions: More questions
        DeveloperAnswers --> [*]: All answered
    }

    AIQuestionnaire --> AIDraft: Context gathered

    state AIDraft {
        [*] --> AgentImplements
        AgentImplements --> FilesCreated
        FilesCreated --> TestsWritten
        TestsWritten --> SummaryGenerated
        SummaryGenerated --> [*]
    }

    AIDraft --> HumanReview: Draft complete

    state HumanReview {
        [*] --> ReviewInIDE
        ReviewInIDE --> TestInStorybook
        TestInStorybook --> MinorTweaks
        MinorTweaks --> [*]
    }

    HumanReview --> AIQuiz: Review complete

    state AIQuiz {
        [*] --> AgentQuizzes
        AgentQuizzes --> DeveloperAnswersQuiz
        DeveloperAnswersQuiz --> [*]
    }

    AIQuiz --> PRCreated: Quiz passed
    PRCreated --> CIRunning: PR submitted
    CIRunning --> CIPassed: All checks green
    CIRunning --> CIFailed: Check failed
    CIFailed --> AgentAutoFix: Agent diagnoses
    AgentAutoFix --> CIRunning: Fix pushed

    CIPassed --> CodeReview: Reviewer assigned

    state CodeReview {
        [*] --> DevLeadReviews
        DevLeadReviews --> Approved
        DevLeadReviews --> ChangesRequested
        ChangesRequested --> AgentFixesIssues
        AgentFixesIssues --> DevLeadReviews: Re-review
    }

    CodeReview --> Merged: PR approved & merged
    Merged --> Deploying: CI/CD pipeline runs
    Deploying --> Deployed: Pipeline complete

    Deployed --> [*]
```

---

## 4. Event Bus & Automatic Status Transitions

Every task status transition is driven by events, not manual updates. The Event Bus receives events from apps, the Rule Engine matches them to workflow transitions, and the Action Registry fires notifications and status updates.

```mermaid
flowchart LR
    subgraph Sources["Event Sources"]
        TM[Task Manager]
        WM[Workspace Manager]
        AI[AI Agent Manager]
        GH[GitHub / Jira]
        CI[CI Monitor]
    end

    subgraph Bus["Event Bus"]
        EB[/"Unix Socket<br/>NDJSON Protocol"/]
    end

    subgraph Engine["Rule Engine"]
        RE{"Match event<br/>to workflow<br/>transition"}
    end

    subgraph Actions["Action Registry"]
        NT[Send Notification]
        ST[Update Task Status]
        RA[Run Agent / Script]
        JR[Sync to Jira]
    end

    TM -->|task_started| EB
    WM -->|branch_created| EB
    AI -->|pr_created| EB
    GH -->|pr_review_received| EB
    GH -->|pr_merged| EB
    CI -->|deploy_complete| EB

    EB --> RE
    RE --> NT
    RE --> ST
    RE --> RA
    RE --> JR

    classDef source fill:#1a2744,stroke:#58a6ff,color:#58a6ff
    classDef bus fill:#1a3a3a,stroke:#3fb950,color:#3fb950
    classDef engine fill:#2a1a3a,stroke:#bc8cff,color:#bc8cff
    classDef action fill:#3a2a1a,stroke:#f0883e,color:#f0883e

    class TM,WM,AI,GH,CI source
    class EB bus
    class RE engine
    class NT,ST,RA,JR action
```

### Event-to-Transition Mapping

```mermaid
sequenceDiagram
    participant Dev as Developer
    participant TM as Task Manager
    participant EB as Event Bus
    participant RE as Rule Engine
    participant JR as Jira Sync

    Dev->>TM: Click "Start Work"
    TM->>EB: task_started
    EB->>RE: match rules
    RE->>JR: Backlog → In Progress

    Note over Dev: AI Questionnaire + Draft...

    Dev->>TM: PR created
    TM->>EB: pr_created
    EB->>RE: match rules
    RE->>JR: In Progress → In Review
    RE-->>Dev: Notify reviewer (toast)

    Note over Dev: Code review...

    Dev->>TM: PR approved
    TM->>EB: pr_review_received (approved)
    EB->>RE: match rules
    RE->>JR: In Review → Approved

    Dev->>TM: PR merged
    TM->>EB: pr_merged
    EB->>RE: match rules
    RE->>JR: Approved → Deploying

    Note over Dev: CI/CD pipeline runs...

    TM->>EB: deploy_complete
    EB->>RE: match rules
    RE->>JR: Deploying → Deployed
    RE-->>Dev: Notify team (toast)
```

---

## 5. Notification Flow

Events flow through the system and produce role-targeted notifications at each stage.

```mermaid
flowchart TD
    subgraph Events["Triggering Events"]
        E1[task_started]
        E2[pr_created]
        E3[ci_failed]
        E4[ci_passed]
        E5[pr_review: changes_requested]
        E6[pr_review: approved]
        E7[pr_merged]
        E8[deploy_complete]
    end

    EB[/"Event Bus"/]
    RE{"Rule Engine"}

    subgraph Notifications["Notification Targets"]
        direction LR
        DEV["Developer<br/>(author)"]
        DL["Dev Lead<br/>(reviewer)"]
        MGR["Manager"]
        PO["Product Owner"]
    end

    E1 --> EB --> RE
    E2 --> EB
    E3 --> EB
    E4 --> EB
    E5 --> EB
    E6 --> EB
    E7 --> EB
    E8 --> EB

    RE -->|task updates| MGR
    RE -->|review requested| DL
    RE -->|CI failure| DEV
    RE -->|CI pass| DEV
    RE -->|changes requested| DEV
    RE -->|approved| DEV
    RE -->|merged| DEV
    RE -->|merged| DL
    RE -->|deployed| DEV
    RE -->|deployed| DL
    RE -->|deployed| MGR
    RE -->|deployed| PO

    classDef event fill:#1a2744,stroke:#58a6ff,color:#58a6ff
    classDef bus fill:#1a3a3a,stroke:#3fb950,color:#3fb950
    classDef engine fill:#2a1a3a,stroke:#bc8cff,color:#bc8cff
    classDef target fill:#3a2a1a,stroke:#f0883e,color:#f0883e

    class E1,E2,E3,E4,E5,E6,E7,E8 event
    class EB bus
    class RE engine
    class DEV,DL,MGR,PO target
```

---

## 6. App Involvement by Workflow Phase

Which RobOS apps participate in each phase of the model flow.

```mermaid
flowchart TB
    subgraph Phase1["Phase 1: Setup & Config"]
        A1[Task Servers]
        A2[Workflow Studio]
        A3[Git Projects]
        A4[Pass Manager]
        A5[Security Setup]
    end

    subgraph Phase2["Phase 2: Requirements"]
        B1[Task Manager]
        B2[Context Manager]
    end

    subgraph Phase3["Phase 3: Onboarding"]
        C1[Git Projects]
        C2[Dev Tools]
        C3[Pass Manager]
        C4[Security Setup]
    end

    subgraph Phase4["Phase 4: Development"]
        D1[Task Manager]
        D2[Workspace Manager]
        D3[AI Agent Manager]
        D4[Dev Central]
    end

    subgraph Phase5["Phase 5: Review"]
        E1[PR Review Board]
        E2[Toast Daemon]
        E3[Notifications]
    end

    subgraph Phase6["Phase 6: Deploy"]
        F1[CI Monitor]
        F2[Toast Daemon]
    end

    subgraph Phase7["Phase 7: Dashboards"]
        G1[Manager Dashboard]
        G2[Dev Central]
        G3[Work Journal]
    end

    subgraph Background["Always Running"]
        H1[Event Bus]
        H2[Rule Engine]
        H3[Agent Scheduler]
        H4[Toast Daemon]
    end

    Phase1 --> Phase2 --> Phase3 --> Phase4 --> Phase5 --> Phase6 --> Phase7
    Background -.->|drives| Phase4
    Background -.->|drives| Phase5
    Background -.->|drives| Phase6

    classDef setup fill:#1a2744,stroke:#58a6ff,color:#58a6ff
    classDef req fill:#2a1a3a,stroke:#bc8cff,color:#bc8cff
    classDef onboard fill:#1a3a1a,stroke:#2ea043,color:#2ea043
    classDef dev fill:#3a2a1a,stroke:#f0883e,color:#f0883e
    classDef review fill:#3a1a2a,stroke:#f778ba,color:#f778ba
    classDef deploy fill:#1a3a3a,stroke:#3fb950,color:#3fb950
    classDef dash fill:#2a2a1a,stroke:#d29922,color:#d29922
    classDef bg fill:#0d1117,stroke:#484f58,color:#484f58

    class A1,A2,A3,A4,A5 setup
    class B1,B2 req
    class C1,C2,C3,C4 onboard
    class D1,D2,D3,D4 dev
    class E1,E2,E3 review
    class F1,F2 deploy
    class G1,G2,G3 dash
    class H1,H2,H3,H4 bg
```

---

## 7. Role-Based Perspectives

Each role experiences the same lifecycle from a different vantage point.

### Product Owner Perspective

```mermaid
flowchart LR
    PO1["Define Requirements<br/><i>Task Manager</i>"] --> PO2["AI Story Breakdown<br/><i>Task Manager</i>"] --> PO3["Track on Sprint Board<br/><i>Dev Central</i>"]
    PO3 -.->|stories in progress| PO3
    PO3 --> PO4["Review Staged Changes<br/><i>Stage Demo Viewer</i>"] --> PO5["Approve or File Bugs<br/><i>Task Manager</i>"]
    PO5 -->|bug filed| PO3
    PO5 -->|approved| PO6["Release Ships<br/><i>Manager Dashboard</i>"]

    classDef po fill:#1a2744,stroke:#58a6ff,color:#58a6ff
    class PO1,PO2,PO3,PO4,PO5,PO6 po
```

### Developer Perspective

```mermaid
flowchart LR
    D1["Pick Up Task<br/><i>Task Manager</i>"] --> D2["Workspace Auto-Provisions<br/><i>Workspace Manager</i>"] --> D3["AI Questionnaire<br/><i>Agent Manager</i>"]
    D3 --> D4["AI Drafts Code<br/><i>Agent Manager</i>"] --> D5["Review in IDE<br/><i>Dev Tools</i>"] --> D6["AI Quiz<br/><i>Agent Manager</i>"]
    D6 --> D7["PR Created<br/><i>Agent Manager</i>"] --> D8["CI Passes<br/><i>CI Monitor</i>"] --> D9["Code Review<br/><i>PR Review Board</i>"]
    D9 -->|changes requested| D5
    D9 -->|approved| D10["Merge & Deploy<br/><i>CI Monitor</i>"]
    D10 --> D11["Story Deployed<br/><i>Task Manager</i>"]

    classDef dev fill:#1a3a1a,stroke:#2ea043,color:#2ea043
    class D1,D2,D3,D4,D5,D6,D7,D8,D9,D10,D11 dev
```

### Dev Lead Perspective

```mermaid
flowchart LR
    DL1["Notification: PR Ready<br/><i>Toast Daemon</i>"] --> DL2["AI Summary + Risk Assessment<br/><i>PR Review Board</i>"]
    DL2 --> DL3["Start the App / Run to Breakpoint<br/><i>PR Review Board + IDE</i>"]
    DL3 --> DL4{"Decision"}
    DL4 -->|Request Changes| DL5["Comment on PR<br/><i>PR Review Board</i>"]
    DL5 --> DL6["Agent Fixes Issues<br/><i>Agent Manager</i>"] --> DL2
    DL4 -->|Approve| DL7["PR Approved<br/><i>PR Review Board</i>"]
    DL7 --> DL8["Track Review Metrics<br/><i>Dev Central</i>"]

    classDef dl fill:#2a1a3a,stroke:#bc8cff,color:#bc8cff
    classDef decision fill:#3a2a1a,stroke:#f0883e,color:#f0883e
    class DL1,DL2,DL3,DL5,DL6,DL7,DL8 dl
    class DL4 decision
```

### Manager Perspective

```mermaid
flowchart LR
    M1["Sprint Board<br/><i>Manager Dashboard</i>"] --> M2["Per-Developer Velocity<br/><i>Manager Dashboard</i>"]
    M2 --> M3["Deployment Tracker<br/><i>Manager Dashboard</i>"]
    M3 --> M4["AI-Generated Reports<br/><i>Manager Dashboard</i>"]
    M4 --> M5["Retrospective<br/><i>Task Manager</i>"]

    M1 -.->|real-time updates via Event Bus| M1

    classDef mgr fill:#3a2a1a,stroke:#f0883e,color:#f0883e
    class M1,M2,M3,M4,M5 mgr
```

---

## 8. End-to-End Timeline (Model Problem)

A concrete timeline showing Acme Inc's developer Alex working story BBF-3 through the complete flow.

```mermaid
gantt
    title BBF-3: Worker Config Form — Full Lifecycle
    dateFormat HH:mm
    axisFormat %H:%M

    section Setup
    Pick up task + auto-provision workspace    :done, setup, 09:00, 15m

    section AI Workflow
    AI Questionnaire (2 questions)              :done, quest, 09:15, 5m
    AI Draft (5 files created)                  :done, draft, 09:20, 25m
    Human Review in IDE                         :done, review, 09:45, 45m
    AI Quiz                                     :done, quiz, 10:30, 15m

    section PR Lifecycle
    PR #12 created + CI runs                    :done, pr, 10:45, 45m
    Dev Lead review                             :done, dlrev, 11:30, 170m
    Changes requested (memoize fix)             :done, fix, 13:00, 30m
    Re-review + approval                        :done, approve, 13:30, 50m

    section Deploy
    Merge to main                               :done, merge, 14:20, 5m
    CI/CD: build + npm publish                  :done, deploy, 14:25, 15m
    Deployed as v1.3.0                          :milestone, shipped, 14:40, 0m
```

---

## 9. Customizable Workflow Engine

All workflows are defined as YAML in the RobOS Distributed Config Store (git-backed) and editable via Workflow Studio. This diagram shows the relationship between configuration and runtime.

```mermaid
flowchart TB
    subgraph Config["Workflow Definition (YAML)"]
        WF["workflows/default.yaml<br/><i>stages, gates, transitions</i>"]
    end

    subgraph Storage["RobOS Distributed Config Store"]
        GIT[("Git-backed<br/>~/.config/robos/")]
    end

    subgraph Apps["Configuration Apps"]
        WS[Workflow Studio]
        RC[RobOS Config Manager]
    end

    subgraph Runtime["Runtime Engine"]
        EB[Event Bus]
        RE[Rule Engine]
        AR[Action Registry]
    end

    subgraph Targets["Execution Targets"]
        JIRA[Jira Status Update]
        TOAST[Toast Notification]
        AGENT[Agent Script]
        LOG[Work Journal Entry]
    end

    WS -->|edit| WF
    RC -->|edit| WF
    WF -->|stored in| GIT
    GIT -->|loaded by| RE
    EB -->|events| RE
    RE -->|matched transitions| AR
    AR --> JIRA
    AR --> TOAST
    AR --> AGENT
    AR --> LOG

    classDef config fill:#1a2744,stroke:#58a6ff,color:#58a6ff
    classDef store fill:#1a3a1a,stroke:#2ea043,color:#2ea043
    classDef app fill:#2a1a3a,stroke:#bc8cff,color:#bc8cff
    classDef runtime fill:#3a2a1a,stroke:#f0883e,color:#f0883e
    classDef target fill:#1a3a3a,stroke:#3fb950,color:#3fb950

    class WF config
    class GIT store
    class WS,RC app
    class EB,RE,AR runtime
    class JIRA,TOAST,AGENT,LOG target
```

### Default Story Workflow Stages

```mermaid
flowchart LR
    S1[setup] --> S2[ai_questionnaire] --> S3[ai_draft] --> S4[human_review]
    S4 --> S5[ai_quiz] --> S6[pr_created] --> S7[ci] --> S8[review_fix]
    S8 --> S9[approved] --> S10[merged] --> S11[deployed]
    S8 -.->|cycle| S8

    classDef stage fill:#1a2744,stroke:#58a6ff,color:#58a6ff
    classDef ai fill:#2a1a3a,stroke:#bc8cff,color:#bc8cff
    classDef human fill:#1a3a1a,stroke:#2ea043,color:#2ea043
    classDef ci fill:#3a2a1a,stroke:#f0883e,color:#f0883e

    class S1 stage
    class S2,S3,S5,S8 ai
    class S4,S9 human
    class S6,S7,S10,S11 ci
```

---

## 10. Data Flow: What Connects to What

How the major system components exchange data.

```mermaid
flowchart TB
    subgraph External["External Systems"]
        JIRA["Jira / GitHub Issues"]
        GITHUB["GitHub (repos, PRs, CI)"]
        NPM["npm Registry"]
    end

    subgraph Core["RobOS Core"]
        TS["Task Servers<br/><i>bidirectional sync</i>"]
        EB["Event Bus<br/><i>Unix socket NDJSON</i>"]
        CFG["Distributed Config<br/><i>git-backed</i>"]
    end

    subgraph Apps["RobOS Apps"]
        TM["Task Manager"]
        WM["Workspace Manager"]
        AM["AI Agent Manager"]
        PRB["PR Review Board"]
        CIM["CI Monitor"]
        MD["Manager Dashboard"]
        TD["Toast Daemon"]
    end

    subgraph IDE["IDE Layer"]
        IDE1["IntelliJ / VS Code"]
        IPC["IPC HTTP Server<br/><i>port 63343</i>"]
    end

    JIRA <-->|REST API| TS
    GITHUB <-->|gh CLI / API| TM
    GITHUB -->|webhooks / polling| CIM
    NPM <--|publish| CIM

    TS --> TM
    TM --> EB
    WM --> EB
    AM --> EB
    CIM --> EB

    EB --> TD
    EB --> MD
    EB --> TM

    CFG --> WM
    CFG --> AM
    CFG --> TM

    AM --> IPC
    PRB --> IPC
    IPC --> IDE1

    classDef external fill:#3a1a2a,stroke:#f778ba,color:#f778ba
    classDef core fill:#1a3a3a,stroke:#3fb950,color:#3fb950
    classDef app fill:#1a2744,stroke:#58a6ff,color:#58a6ff
    classDef ide fill:#2a1a3a,stroke:#bc8cff,color:#bc8cff

    class JIRA,GITHUB,NPM external
    class TS,EB,CFG core
    class TM,WM,AM,PRB,CIM,MD,TD app
    class IDE1,IPC ide
```

---

## Related Documentation

| Document | Description |
|----------|-------------|
| [model-problem.md](model-problem.md) | Complete end-to-end walkthrough using the Acme Inc / Buildbarn Forms scenario |
| [workflow-examples.md](workflow-examples.md) | Detailed workflow for each work item type (Release, Epic, Story, Bug) |
| [user-types-and-use-cases.md](user-types-and-use-cases.md) | Use cases for each of the four user roles |
| [project-plan/README.md](project-plan/README.md) | Implementation plan with epic dependency diagram |
