---
title: Training
layout: default
nav_order: 8
has_children: true
permalink: /training/
redirect_from:
  - /training/review-based-development/
  - /training/review-based-development/01-death-of-lgtm-rubber-stamping.html
  - /training/review-based-development/02-pr-review-theater-workflow.html
  - /training/review-based-development/03-ide-review-bridge-and-breakpoint-debugging.html
---

# Training
{: .no_toc }

Short lessons for the RobOS tools that plan work, run coding agents, and control what agents send and run. Each lesson uses commands and screens that exist in the repository and says where a feature is limited.
{: .fs-6 }

## Lessons

| Track | Lesson | You will | Needs |
|:---|:---|:---|:---|
| [Plan and run agent tasks]({{ '/training/agent-tasks/' | relative_url }}) | [Plan a feature in Task Planner]({{ '/training/agent-tasks/plan-a-feature.html' | relative_url }}) | Turn a template form or a description into an epic with tasks and create the issues. | A GitHub or Jira task server, `gh` |
| | [Check impact with the kgraph CLI]({{ '/training/agent-tasks/check-impact-with-kgraph.html' | relative_url }}) | Find what depends on a component and validate a graph change before an agent starts. | Node.js 20 or later, a checkout |
| | [Run an agent on a task]({{ '/training/agent-tasks/run-an-agent.html' | relative_url }}) | Start Claude Code from Task Implementer on an issue and review the branch it pushes. | A task server, `claude`, `gh` |
| | [Choose and customize agent personas]({{ '/training/agent-tasks/agent-personas.html' | relative_url }}) | Pick the role prompt an agent gets and add your own. | Task Implementer or Task Planner |
| [Agent harness and security]({{ '/training/harness-and-security/' | relative_url }}) | [Configure the prompt security guard]({{ '/training/harness-and-security/prompt-security-guard.html' | relative_url }}) | Redact or block secrets, card numbers and injection phrases in prompts. | Node.js 20 or later |
| | [Run commands in an ephemeral agent profile]({{ '/training/harness-and-security/agent-profiles.html' | relative_url }}) | Give an agent a throwaway home directory, and know what that does and does not isolate. | Linux, `python3`, Electron |

## Where the rest is documented

These lessons stop where another page already covers the topic.

| Topic | Page |
|:---|:---|
| Creating a project from a template | [New app wizard]({{ site.baseurl }}{% link new-app-wizard.md %}) |
| Reviewing an agent's branch, the quiz and evidence stages, signing off | [PR Review Theater]({{ site.baseurl }}{% link pr-review-theater.md %}) |
| What the knowledge graph stores and how packages are laid out | [Knowledge graph]({{ site.baseurl }}{% link knowledge-graph.md %}) |
| Which models and agent tiers RobOS uses for which job | [Agent tiers]({{ site.baseurl }}{% link agent-tiers.md %}) |
| Installing RobOS and opening the first app | [Get started]({{ site.baseurl }}{% link getting-started.md %}) |

## Running the apps

Open an app from the App Launcher, or run it from a checkout with Electron:

```bash
electron packages/task-planner
```

Replace `task-planner` with the package folder of the app. Every lesson names the apps it uses and links to their app pages.
