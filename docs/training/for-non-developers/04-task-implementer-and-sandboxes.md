---
title: "4. Autonomous Task Implementation & Sandboxes"
layout: default
parent: For Non-Developers
grand_parent: Training
nav_order: 4
permalink: /training/for-non-developers/04-task-implementer-and-sandboxes.html
---

# Module 4: Autonomous Task Implementation & Sandboxes
{: .no_toc }

Step 3 of the lifecycle: How the Task Implementer drives autonomous coding agents, how disposable in-memory sandboxes keep your computer pristine, and how non-developers use Breakpoint Debugging to inspect live apps mid-flight.
{: .fs-6 .fw-300 }

## Table of contents
{: .no_toc .text-delta }

1. TOC
{:toc}

---

## Welcome to the Cleanroom: Ephemeral `tmpfs` Sandboxes

The single biggest fear people have when letting an AI run commands on their computer is simple: **"What if it breaks my computer?"**

What if an agent deletes your personal photos? What if it modifies your global Python environment and breaks your other apps? What if it accidentally leaks your SSH keys or passwords?

RobOS solves this with **Ephemeral In-Memory Sandboxes (`tmpfs`)**:

```mermaid
flowchart LR
    Host["Your Personal Computer<br/>(Physical OS, Personal Files, Safe)"]
    
    subgraph Sandbox ["Disposable tmpfs RAM Sandbox"]
        Agent["Autonomous AI Agent"]
        Code["Isolated Code Checkout"]
        Build["Builds, Dependencies & Tests"]
        Screen["Virtual Display (Xvfb 1080p)"]
    end
    
    Host -- "1. Mounts Ephemeral Workspace in RAM" --> Sandbox
    Sandbox -- "2. Discarded After PR or Test Run" --> Clean["Zero Residual Files or Clutter"]
    
    style Host fill:#0d1117,stroke:#10b981,stroke-width:2px,color:#e6edf3
    style Sandbox fill:#161b22,stroke:#00e5ff,stroke-width:2px,color:#e6edf3
    style Clean fill:#0d1117,stroke:#38bdf8,stroke-width:2px,color:#e6edf3
```

- When an agent starts a task, RobOS creates an isolated workspace that lives purely in temporary RAM (`tmpfs`).
- The agent gets its own virtual display (Xvfb) so it can boot graphical applications (like Chrome or Godot) without popping windows up over your mouse cursor.
- When the task is done, the sandbox is completely torn down. **Zero residual clutter, zero machine pollution, zero security risk.**

---

## Driving the Task Implementer

When you open **Task Implementer** (`packages/task-implementer`), you see your project's active tasks lined up in prioritized order.

<div style="margin: 1.5rem 0;">
  <img src="{{ '/assets/images/screenshots/acme-petshop-step10-task_implementer_frame.png' | relative_url }}" alt="Task Implementer Live Execution Screen" class="robos-zoomable-img" style="display: block; width: 100%; height: auto; border-radius: 8px; border: 1px solid #30363d;" />
  <p style="text-align: center; color: #8b949e; font-size: 0.85rem; margin-top: 0.5rem;"><em>Screenshot 4.1: Task Implementer running an autonomous implementation task.</em></p>
</div>

When you click **Start Implementation on Task #12**:
1. **Branch Checkout**: The agent creates an isolated Git feature branch (e.g. `feature/12-buddy-gig-escrow`).
2. **Sandbox Provisioning**: RobOS mounts the in-memory `tmpfs` workspace.
3. **Context Injection**: The agent reads the exact task acceptance criteria and linked Knowledge Graph nodes.
4. **Execution Loop**: The agent writes the code, installs necessary local libraries inside the sandbox, and runs tests.

<div style="margin: 1.5rem 0;">
  <img src="{{ '/assets/images/screenshots/acme-petshop-step5-provisioning_frame.png' | relative_url }}" alt="Sandbox Provisioning Stage" class="robos-zoomable-img" style="display: block; width: 100%; height: auto; border-radius: 8px; border: 1px solid #30363d;" />
  <p style="text-align: center; color: #8b949e; font-size: 0.85rem; margin-top: 0.5rem;"><em>Screenshot 4.2: RobOS provisioning the isolated execution environment.</em></p>
</div>

---

## Breakpoint Debugging for Non-Developers

What if you want to see what the agent is building *before* it finishes?

In traditional programming, "debugging" meant staring at raw memory addresses. In RobOS, **Breakpoint Debugging** is like a **Pause Button on an automated movie set**:

<div style="margin: 1.5rem 0;">
  <img src="{{ '/assets/images/screenshots/acme-petshop-step5-breakpoint_frame.png' | relative_url }}" alt="Breakpoint Debugger Paused State" class="robos-zoomable-img" style="display: block; width: 100%; height: auto; border-radius: 8px; border: 1px solid #30363d;" />
  <p style="text-align: center; color: #8b949e; font-size: 0.85rem; margin-top: 0.5rem;"><em>Screenshot 4.3: Pausing execution at a breakpoint for live visual inspection.</em></p>
</div>

When an agent hits a breakpoint:
- Execution temporarily pauses.
- The app stays loaded in memory.
- You can open the live window, look at the screen layout, click buttons, and inspect values.
- In the variable inspector, you can see live data (e.g. `party_gold = 150`, `escrow_deposit = $25`).

<div style="margin: 1.5rem 0;">
  <img src="{{ '/assets/images/screenshots/acme-petshop-step5-debugger_state_frame.png' | relative_url }}" alt="Live Variables and Debugger State" class="robos-zoomable-img" style="display: block; width: 100%; height: auto; border-radius: 8px; border: 1px solid #30363d;" />
  <p style="text-align: center; color: #8b949e; font-size: 0.85rem; margin-top: 0.5rem;"><em>Screenshot 4.4: Inspecting live variables and state during a paused breakpoint session.</em></p>
</div>

If you like what you see, you simply click **Resume** and the agent continues!

---

## Verifiable Scorecards: Watching Tests Turn Green

How do you know the agent didn't write fake code that looks pretty but actually crashes?

Before finishing, the Task Implementer runs automated test suites:

<div style="margin: 1.5rem 0;">
  <img src="{{ '/assets/images/screenshots/acme-petshop-step5-execution_verified_frame.png' | relative_url }}" alt="Execution Verified Test Scorecard" class="robos-zoomable-img" style="display: block; width: 100%; height: auto; border-radius: 8px; border: 1px solid #30363d;" />
  <p style="text-align: center; color: #8b949e; font-size: 0.85rem; margin-top: 0.5rem;"><em>Screenshot 4.5: Automated test execution scorecard showing 100% verified assertions.</em></p>
</div>

The scorecard shows:
- **Test Results**: e.g., "6 passed, 0 failed in 1.4s".
- **Contract Compatibility**: Proving the frontend matches the backend schema.
- **Narrated Video Capture**: A 1080p recording of the test running in the virtual screen.

With the task implemented and verified, the agent opens a Pull Request into the **PR Review Theater**.

---

Now that you understand the machinery, let's build our two real-world projects!

Proceed to **[Module 5: Project 1 — Building getemgigs.com (Web App to Chrome)]({{ '/training/for-non-developers/05-project-getemgigs-web-app.html' | relative_url }})**!
