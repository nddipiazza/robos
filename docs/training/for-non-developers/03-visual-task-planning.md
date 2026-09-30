---
title: "Visual Project & Task Planning"
layout: default
parent: For Non-Developers
grand_parent: Training
nav_order: 3
permalink: /training/for-non-developers/03-visual-task-planning.html
---

# Visual Project & Task Planning
{: .no_toc }

From raw ideas to structured milestones in Task Planner: resolve design questions with interactive web forms, build a dependency task graph, and sync to your visual project board.
{: .fs-6 .fw-300 }

## Table of contents
{: .no_toc .text-delta }

1. TOC
{:toc}

---

## Why Giant Prompts Make AI Agents Explode

When beginners first use AI tools, they almost always write a massive, unstructured paragraph like this:

> *"Build me a complete fantasy role-playing game with five dungeons, an inventory system, a trading shop, sixteen magic spells, real-time combat, audio sound effects, and a boss fight."*

What happens when an AI agent receives a prompt like that?
- The agent gets completely overwhelmed by context overload (trying to remember and process too much information at once).
- It tries to write thousands of lines of code across numerous files all at once.
- It suffers from **Context Rot**: halfway through writing the inventory screen, it forgets what the combat rules were.
- It invents fake helper functions that don't exist, crashes midway through, and leaves you with a broken mess.

In human engineering, nobody builds a skyscraper by telling a construction crew "build a building". You create an architect's blueprint, pour the foundation first, frame the floors, install the plumbing, wire the electricity, and inspect each stage before moving to the next.

In RobOS, this architectural blueprint is created visually in **Task Planner** (`packages/task-planner`).

---

## The Anatomy of a Perfect Task

Before opening the planner, understand what makes a task succeed when an autonomous AI agent executes it. Every great task includes clear specification components:

| Component | Purpose | Example (`getemgigs.com`) | Example (`crpg-realm`) |
|:---|:---|:---|:---|
| **Concise Title** | A short, unambiguous action | `Add rotating door QR code API` | `Implement Hero's Sword weapon and ground pickup` |
| **User Story** | Why this feature exists | *As a gig attendee, I want my ticket QR code to refresh periodically so no one can screenshot it.* | *As a hero, I want to pick up Torvald's forged sword so I can unlock the castle gate.* |
| **Acceptance Criteria** | Observable, testable proof | *Calling `/api/qr/token` returns a hash that expires on schedule.* | *Walking over the sword adds +3 ATK to Sir Caleb and sets `obtained_heros_sword = true`.* |
| **Out of Scope** | What the agent must NOT touch | *Do not integrate Stripe or process real credit cards yet.* | *Do not modify the boss fight or change overworld terrain.* |

---

## The Task Planning Workflow

Let's inspect the exact screens from our automated test runs to see how Task Planner turns ideas into structured, bite-sized tasks.

### The Prompt Modal & Context Sources

When you open Task Planner, click **New Project Plan**. The prompt modal lets you describe your feature in simple English and attach context sources.

<div style="margin: 1.5rem 0;">
  <img src="{{ '/assets/images/screenshots/acme-petshop-step1-prompt_frame.png' | relative_url }}" alt="Task Planner Prompt Input Modal" class="robos-zoomable-img" style="display: block; width: 100%; height: auto; border-radius: 8px; border: 1px solid #30363d;" />
  <p style="text-align: center; color: #8b949e; font-size: 0.85rem; margin-top: 0.5rem;"><em>Entering your feature goals and selecting context sources in Task Planner.</em></p>
</div>

Notice the `@-search` feature: You can type `@getemgigs` or `@crpg-realm` to immediately link existing database tables, map scenes, or API contracts.

---

### Clarification Questionnaires (Interactive Web Forms)

AI agents often make assumptions when requirements are underspecified. To prevent bad assumptions, Task Planner includes an **Interactive Clarification Questionnaire**.

<div style="margin: 1.5rem 0;">
  <img src="{{ '/assets/images/screenshots/acme-petshop-step1-question_frame.png' | relative_url }}" alt="Interactive Clarification Questionnaire" class="robos-zoomable-img" style="display: block; width: 100%; height: auto; border-radius: 8px; border: 1px solid #30363d;" />
  <p style="text-align: center; color: #8b949e; font-size: 0.85rem; margin-top: 0.5rem;"><em>Answering multiple-choice design decisions instead of writing essays.</em></p>
</div>

Instead of forcing you to write essays, the planner asks targeted multiple-choice questions:
- *"Do you want rotating QR check-in codes with timed expiry, or static venue barcodes?"*
- *"Should the trap trigger when stepped on, or allow a Rogue perception check first?"*
- *"Should the hero character start with Full Plate armor or Leather armor?"*

You click the option you want, and the planner immediately factors your design decisions into the architectural plan.

---

### Reviewing the Milestone Proposal

Next, Task Planner synthesizes a comprehensive **Plan Proposal**.

<div style="margin: 1.5rem 0;">
  <img src="{{ '/assets/images/screenshots/acme-petshop-step1-plan_frame.png' | relative_url }}" alt="Task Plan Proposal Review" class="robos-zoomable-img" style="display: block; width: 100%; height: auto; border-radius: 8px; border: 1px solid #30363d;" />
  <p style="text-align: center; color: #8b949e; font-size: 0.85rem; margin-top: 0.5rem;"><em>Reviewing the generated plan proposal and task breakdowns.</em></p>
</div>

The plan organizes your feature into logical milestones:
- **Core Data Models &amp; Schemas**
- **Backend Logic &amp; Verification Tests**
- **User Interface &amp; Interactive Controls**
- **End-to-End Verification &amp; Walkthrough**

---

### The Dependency Flowchart (DAG View)

How does an AI agent know what order to build things in?
In Task Planner, every task has explicit prerequisites arranged in a **Directed Acyclic Graph (DAG)**—which is simply a visual flowchart where work flows in one clear forward direction without any circular loops.

<div style="margin: 1.5rem 0;">
  <img src="{{ '/assets/images/screenshots/acme-petshop-step1-dag_frame.png' | relative_url }}" alt="Directed Acyclic Graph Task Tree" class="robos-zoomable-img" style="display: block; width: 100%; height: auto; border-radius: 8px; border: 1px solid #30363d;" />
  <p style="text-align: center; color: #8b949e; font-size: 0.85rem; margin-top: 0.5rem;"><em>Visual dependency graph ensuring tasks execute in logical order.</em></p>
</div>

<div style="margin: 2rem 0;">
  <img src="{{ '/assets/images/training/task-dag-flowchart.jpg' | relative_url }}" alt="Task Dependency Flowchart (DAG)" class="robos-zoomable-img" style="display: block; width: 100%; height: auto; border-radius: 8px; border: 1px solid #30363d;" />
  <p style="text-align: center; color: #8b949e; font-size: 0.85rem; margin-top: 0.5rem;"><em>Structured task dependency flow: prerequisites unlock downstream tasks in one unstoppable direction.</em></p>
</div>

> [!NOTE]
> **What Does "Acyclic" Mean?**  
> "Acyclic" simply means **there are no circular loops**.
> - Bad Loop: Task A requires Task B, and Task B requires Task A. The agent freezes in an infinite deadlock.
> - Acyclic DAG: Prerequisite tasks finish first, unlocking dependent tasks downstream. The work flows in one clear, unstoppable direction.

---

### Syncing Tasks to Your Visual Project Board

Once you are satisfied with the plan, click **Sync to Project**.

<div style="margin: 1.5rem 0;">
  <img src="{{ '/assets/images/screenshots/acme-petshop-step1-synced_badge_frame.png' | relative_url }}" alt="Tasks Synced to Visual Project Board" class="robos-zoomable-img" style="display: block; width: 100%; height: auto; border-radius: 8px; border: 1px solid #30363d;" />
  <p style="text-align: center; color: #8b949e; font-size: 0.85rem; margin-top: 0.5rem;"><em>All tasks converted into tracked, organized work cards with a single click.</em></p>
</div>

> [!NOTE]
> **What Is an "Issue" in Software? (It's Not a Bug!)**  
> In everyday conversation, an "issue" sounds like a bug, error, or headache. But in software development:
> - An **"Issue" is simply a to-do card or sticky note** on a project board (just like a card on Trello, Asana, or a refrigerator checklist).
> - Each card lists the instructions, rules, and acceptance criteria for one specific task.
> - Programmers historically tracked these on **GitHub** (the online cloud locker for software projects). In RobOS, you never have to log into GitHub or manually manage spreadsheets—Task Planner automatically creates and organizes these task cards for you!

---

## Hands-On Lab: Designing a Milestone Task Tree

Try this exercise in **Task Planner**:
- Open Task Planner and click **New Plan**.
- Type: *"Add a Potion Shop in Village Square where heroes can buy Healing Potions for 50 gold."*
- Answer the questionnaire:
  - Select *"Standard Potion heals 15 HP"*.
  - Select *"Merchant NPC is located near the Blacksmith"*.
- Review the generated DAG:
  - **Model**: `Add Healing Potion item to items.json with 15 HP heal value`
  - **Logic**: `Add Merchant NPC dialog tree and 50 gold transaction logic`
  - **Test**: `E2E automated test verifying potion purchase and inventory update`
- Click **Sync to Project**!

---

Now that your project blueprint is locked and loaded, let's watch the autonomous agents actually build it!

Proceed to **[Autonomous Task Implementation &amp; Sandboxes]({{ '/training/for-non-developers/04-task-implementer-and-sandboxes.html' | relative_url }})**!

