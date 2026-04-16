---
title: "Phases 5-6: Review & Deploy"
layout: default
parent: The Model Problem
nav_order: 5
---

# Phases 5-6: Code Review & Deploy
{: .no_toc }

Jordan reviews with AI assistance, Alex merges, and the deploy pipeline runs automatically.
{: .fs-6 .fw-300 }

## Table of contents
{: .no_toc .text-delta }

1. TOC
{:toc}

---

## 5.1 — Jordan Gets Notified

When Alex's PR is created, the **Event Bus** fires a chain of actions:

1. `pr_opened` event hits the Event Bus
2. Rule Engine matches: "PR opened in buildbarn-forms → notify reviewers"
3. **Toast Daemon** pops a notification on Jordan's desktop:

> **PR Review Requested**
> PR #12: feat(worker): add WorkerConfigForm — Alex
> *Click to open in Review Tool*

The notification also appears in Jordan's **Notifications App** history and as a badge count on the system tray.

---

## 5.2 — AI-Assisted Code Review

<img src="{{ '/assets/images/icons/pr-review.svg' | relative_url }}" alt="PR Review Board" style="width: 32px; height: 32px; vertical-align: middle;"> **App: PR Review Board**

Jordan clicks the notification and lands in the PR Review Board:

![PR Review Board]({{ '/assets/images/screenshots/pr-review.png' | relative_url }})

### AI Summary Panel

| Section | Content |
|:--------|:--------|
| **What changed** | 5 new files — form component, runner selector, platform matcher, tests, stories |
| **Why** | Implements BBF-3, adds worker config editing UI |
| **Risk assessment** | Low — new files only, no changes to existing components |
| **Test coverage** | 23 new unit tests, 3 Storybook stories |

### Interactive Review Actions

| Action | Description |
|:-------|:------------|
| **"Start the app"** | Launches Storybook, opens the WorkerConfigForm story in a browser |
| **"Run to breakpoint"** | Opens IDE at `WorkerConfigForm.tsx`, sets breakpoint at form submission handler |
| **"Run tests"** | Executes the test suite and shows results inline |
| **"Generate edge case test"** | AI creates a test for an untested scenario |

Jordan clicks **"Start the app"** — Storybook launches and shows the worker config form live. Jordan interacts with it, tries different runner types, verifies the collapsible sections work.

---

## 5.3 — Review Feedback & AI Fix

Jordan leaves a review comment:

> "The RunnerTypeSelector should memoize the field list computation — it rerenders on every parent state change."

**Event chain:**
1. `pr_review_received` (changes_requested) hits Event Bus
2. Alex gets a toast notification with Jordan's feedback
3. The AI agent picks up the feedback, adds `useMemo`, pushes the fix, and comments on the PR

---

## 5.4 — Approval

Jordan re-reviews and approves:

> ✅ "LGTM — memoization fix looks good."

**Automatic transitions:**
- **Jira status → `Approved`** (via `pr_approved` event)
- Alex gets a toast: "PR #12 approved by Jordan. Ready to merge."

---

## 6.1 — Merge & Deploy

Alex clicks **"Merge"** on the PR.

**Event cascade:**
1. `pr_merged` event → **Jira status → `Deploying`**
2. CI/CD pipeline triggers: build, test, npm publish
3. GitHub Actions publishes `@hermetiq/buildbarn-forms@1.3.0`
4. `deploy_pipeline_completed` event → **Jira status → `Deployed`**

**Notifications sent to the entire team:**

| Recipient | Notification |
|:----------|:-------------|
| Alex (developer) | "BBF-3 shipped in @hermetiq/buildbarn-forms@1.3.0" |
| Jordan (dev lead) | "buildbarn-forms v1.3.0 published — includes PR #12" |
| Dana (manager) | "buildbarn-forms v1.3.0 — BBF-3 Worker Config Form deployed" |
| Pat (product owner) | "buildbarn-forms v1.3.0 — BBF-3 Worker Config Form deployed" |

---

## Final Task State

```
BBF-3: Worker Config Form
Status: Deployed ✅
Assignee: Alex
Branch: feat/bbf-3-worker-config-form (merged)
PR: #12 (merged, 1 review cycle)
Version: @hermetiq/buildbarn-forms@1.3.0
Timeline:
  Started:     2026-03-21 09:15
  PR Created:  2026-03-21 11:30
  Approved:    2026-03-21 14:20
  Merged:      2026-03-21 14:25
  Deployed:    2026-03-21 14:40
```

{: .important }
Every status transition happened automatically — no one manually updated Jira at any point.

---

## Automatic Transition Summary

| Trigger Event | Status Transition | How It Happens |
|:--------------|:------------------|:---------------|
| Developer clicks "Start Work" | Backlog → In Progress | Task Manager fires `task_started` event |
| AI agent creates PR | In Progress → In Review | `pr_created` → Rule Engine → Jira |
| Reviewer approves PR | In Review → Approved | `pr_approved` → Rule Engine → Jira |
| PR merged to main | Approved → Deploying | `pr_merged` → Rule Engine → Jira |
| CI/CD pipeline succeeds | Deploying → Deployed | `deploy` → Rule Engine → Jira |
