---
title: "Phase 2: Requirements"
layout: default
parent: The Model Problem
nav_order: 2
---

# Phase 2: Product Engineer Creates Epics & Stories
{: .no_toc }

Pat (Product Engineer) defines what needs to be built, and AI breaks it into actionable stories.
{: .fs-6 .fw-300 }

## Table of contents
{: .no_toc .text-delta }

1. TOC
{:toc}

---

## 2.1 — Pat Defines the Problem

<img src="{{ '/assets/images/icons/task-board.svg' | relative_url }}" alt="Task Manager" style="width: 32px; height: 32px; vertical-align: middle;"> **App: Task Manager**

Pat opens the Task Manager and creates a new Epic:

> **Epic: Build the buildbarn-forms React Component Library**
>
> **Problem:** Platform engineers at Acme configure Buildbarn (a remote build execution system) by hand-editing JSONNET and YAML files based on complex protobuf schemas. Configuration covers workers, storage, schedulers, and browsers — each defined by deeply nested proto messages. This is error-prone, undocumented, and requires deep proto knowledge.
>
> **Success Criteria:**
> - Form components for all major Buildbarn config sections (worker, storage, scheduler, browser)
> - Type-safe validation against proto constraints
> - JSON/YAML export for deployment
> - Published as `@acme/buildbarn-forms` npm package
>
> **Repos:** buildbarn-forms, buildbarn-forms-proto

---

## 2.2 — AI-Assisted Story Breakdown

Pat clicks **"AI Breakdown"** on the epic. The AI agent reads the epic description, the repo structure, the proto definitions, and existing Buildbarn config examples.

AI generates a complete story breakdown:

| # | Story | Priority | Points |
|:--|:------|:---------|:-------|
| BBF-1 | Proto schema parser — read `.proto` files and extract message/field definitions | High | 5 |
| BBF-2 | Form renderer engine — generate React form components from parsed proto schema | High | 8 |
| BBF-3 | Worker config form — `bb_worker` proto with platform/concurrency fields | High | 5 |
| BBF-4 | Storage config form — `bb_storage` blobstore/AC/CAS sections | High | 5 |
| BBF-5 | Scheduler config form — `bb_scheduler` platform queues and drain configs | Medium | 5 |
| BBF-6 | Browser config form — `bb_browser` instance name and CAS settings | Medium | 3 |
| BBF-7 | Validation engine — proto constraint validation (required fields, enums, ranges) | High | 8 |
| BBF-8 | JSON/YAML export — serialize form state to deployable config | High | 5 |
| BBF-9 | Storybook documentation — interactive component gallery | Low | 3 |
| BBF-10 | npm package publishing — CI/CD for versioned releases | Medium | 5 |

Pat reviews the breakdown, adjusts priorities, and confirms. The stories are created in Jira (via bidirectional sync) and appear in every team member's RobOS dashboard.

Jordan assigns reviewers: Jordan is the reviewer for all PRs in this project.
