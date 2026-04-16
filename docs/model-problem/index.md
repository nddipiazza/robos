---
title: The Model Problem
layout: default
nav_order: 3
has_children: true
---

# The Model Problem: Building Buildbarn Forms
{: .no_toc }

A complete walkthrough of RobOS in action — from company setup to deployed code.
{: .fs-6 .fw-300 }

---

## The Scenario

A company called **Acme Inc** adopts RobOS to build the **buildbarn-forms** project — a **React component library** for editing [Buildbarn](https://github.com/buildbarn) remote build execution configurations. A companion repo, **buildbarn-forms-proto**, holds the protobuf definitions that the forms library consumes.

**What is Buildbarn?** Buildbarn is an open-source implementation of Google's Remote Execution API, used by organizations to distribute build and test actions across fleets of workers. It is configured through complex protobuf-defined schemas covering workers, storage backends, schedulers, browsers, and more. These configurations are typically hand-edited as JSONNET or YAML files — error-prone work that requires deep protobuf knowledge.

**What is buildbarn-forms?** A React + TypeScript component library published as `@hermetiq/buildbarn-forms` on npm. It parses `.proto` schema files, generates validated form components for each Buildbarn configuration section, and exports the form state as deployment-ready JSON or YAML. The library includes an interactive Storybook for documentation and testing.

**The Problem:** Platform engineers at Acme configure Buildbarn by hand-editing JSONNET and YAML files based on complex protobuf schemas. A typical Buildbarn deployment has four major config sections — `bb_worker` (build executors, runner types, platform matchers, concurrency), `bb_storage` (blobstore backends, action cache, CAS), `bb_scheduler` (platform queues, drain configs, priority rules), and `bb_browser` (instance names, CAS settings). Each section is defined by deeply nested protobuf messages with `oneof` discriminated unions, repeated fields, and proto constraint validation. Hand-editing these files is error-prone, undocumented, and requires deep proto knowledge.

**The Solution:** buildbarn-forms is a React + TypeScript component library that:

- **Parses `.proto` schema files** and extracts message definitions, field types, constraints, and documentation comments
- **Generates form components** for each Buildbarn config section — with collapsible sections for nested messages, discriminated union selectors for `oneof` fields, and dynamic array editors for repeated fields
- **Validates input** against proto constraints (required fields, enum ranges, numeric bounds) in real time
- **Exports deployment-ready config** as JSON or YAML matching the expected Buildbarn format
- **Documents everything** in an interactive Storybook gallery with live form previews

The library is published as `@hermetiq/buildbarn-forms` on npm and versioned via CI/CD.

Every phase — company setup, developer onboarding, task breakdown, coding, review, deploy, and management dashboards — happens inside RobOS.

---

## Cast of Characters

| Person | Role | RobOS User Type | Daily Apps |
|:-------|:-----|:----------------|:-----------|
| **Dana** | Dev Manager | Manager | Manager Dashboard, Task Servers, Workflow Studio |
| **Pat** | Product Engineer | Product Owner | Task Manager, Dev Central, Stage Demo |
| **Jordan** | Dev Lead | Dev Lead | PR Review Board, CI Monitor, Dev Central |
| **Alex** | Developer | Developer | Task Manager, Workspace Manager, AI Agent Manager |

---

## The Journey

<div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 1.5rem; margin: 2rem 0;">

<div style="background: var(--color-background-alt, #161b22); border-radius: 8px; padding: 1.5rem; border-left: 4px solid #00bcd4;">
<h3 style="margin-top: 0;">Phase 1: Setup</h3>
<p>Dana provisions the team, configures Jira, and defines the task workflow in Workflow Studio.</p>
<a href="{{ site.baseurl }}{% link model-problem/setup.md %}">Read Phase 1 &rarr;</a>
</div>

<div style="background: var(--color-background-alt, #161b22); border-radius: 8px; padding: 1.5rem; border-left: 4px solid #2563eb;">
<h3 style="margin-top: 0;">Phase 2: Requirements</h3>
<p>Pat creates the epic and AI breaks it down into 10 stories with effort estimates.</p>
<a href="{{ site.baseurl }}{% link model-problem/requirements.md %}">Read Phase 2 &rarr;</a>
</div>

<div style="background: var(--color-background-alt, #161b22); border-radius: 8px; padding: 1.5rem; border-left: 4px solid #22c55e;">
<h3 style="margin-top: 0;">Phase 3: Onboarding</h3>
<p>Alex joins the team and is fully productive in 3 minutes — secrets, tools, and repos all auto-provisioned.</p>
<a href="{{ site.baseurl }}{% link model-problem/onboarding.md %}">Read Phase 3 &rarr;</a>
</div>

<div style="background: var(--color-background-alt, #161b22); border-radius: 8px; padding: 1.5rem; border-left: 4px solid #f59e0b;">
<h3 style="margin-top: 0;">Phase 4: Development</h3>
<p>Alex picks up a story. AI asks questions, writes code, and creates a PR — all with developer oversight.</p>
<a href="{{ site.baseurl }}{% link model-problem/development.md %}">Read Phase 4 &rarr;</a>
</div>

<div style="background: var(--color-background-alt, #161b22); border-radius: 8px; padding: 1.5rem; border-left: 4px solid #e11d48;">
<h3 style="margin-top: 0;">Phase 5-6: Review & Deploy</h3>
<p>Jordan reviews with AI assistance, Alex merges, and the deploy pipeline runs — all status transitions are automatic.</p>
<a href="{{ site.baseurl }}{% link model-problem/review-and-deploy.md %}">Read Phases 5-6 &rarr;</a>
</div>

<div style="background: var(--color-background-alt, #161b22); border-radius: 8px; padding: 1.5rem; border-left: 4px solid #8b5cf6;">
<h3 style="margin-top: 0;">Phase 7-8: Dashboards</h3>
<p>Every team member sees real-time progress. Zero manual status updates needed throughout the entire lifecycle.</p>
<a href="{{ site.baseurl }}{% link model-problem/dashboards.md %}">Read Phases 7-8 &rarr;</a>
</div>

</div>

---

## What RobOS Automated (Zero Manual Effort)

| Activity | Traditional Workflow | With RobOS |
|:---------|:---------------------|:-----------|
| Update Jira status | Developer updates manually (or forgets) | Automatic — event-driven transitions |
| Notify reviewer | Developer @-mentions in Slack | Automatic — Event Bus + Rule Engine |
| Developer onboarding | Wiki page + 2 hours of setup | 3 minutes — automated secrets, tools, repos |
| Track sprint progress | Scrum master updates board | Real-time — Task Manager syncs bidirectionally |
| Log hours | Developer fills timesheet | Automatic — timestamps on every transition |
| Write PR description | Developer writes manually | AI generates from task context + code diff |
| Know what deployed | Check CI logs or ask DevOps | Manager Dashboard with per-version story list |
