---
title: RobOS for Teams
layout: default
nav_order: 6
has_children: true
has_toc: false
description: "Start here if you are a tech lead or evaluator deciding whether RobOS fits your team. These pages cover what problem RobOS targets, what is built today, and how a team sets it up."
---

# RobOS for Teams
{: .no_toc }

Start here if you are a tech lead or evaluator deciding whether RobOS fits your team. These pages cover what problem RobOS targets, what is built today, and how a team sets it up.
{: .fs-6 }

## Evaluate

- [Why RobOS]({{ site.baseurl }}{% link why-robos.md %}) states the problem, the approach, what exists in the repository, and the limits.
- [What sets RobOS apart]({{ site.baseurl }}{% link big-wins.md %}) covers the main RobOS features in more depth.
- [PR Review Theater]({{ site.baseurl }}{% link pr-review-theater.md %}) describes the staged pull request review.
- [Review & governance]({{ site.baseurl }}{% link agent-review-development.md %}) is the section on reviewing agent work.
- [Walkthroughs and proof of work]({{ site.baseurl }}{% link walkthroughs.md %}) collects recorded walkthroughs of RobOS apps.
- [Architecture]({{ site.baseurl }}{% link architecture.md %}) shows how the apps and libraries fit together.

## Set up a team

- [Build apps as a team](/build-apps/teams/) walks a team through planning, implementing, reviewing and merging with Task Planner, Task Implementer and Agent Code Review.
- [Company setup]({{ site.baseurl }}{% link existing-company-setup.md %}) is for a team with existing repositories and a task tracker.
- [New company]({{ '/new-company-setup.html' | relative_url }}) is for a team starting from nothing.
- [Personas]({{ site.baseurl }}{% link personas.md %}) lists which apps to open first for four common jobs.
- [Agent tiers]({{ site.baseurl }}{% link agent-tiers.md %}) explains which agent CLIs RobOS can run and which model settings do something today.

## Check before you adopt

| Question | Short answer | Details |
|:---|:---|:---|
| What platform does it need? | The install scripts use `apt` and register the Electron apps in the GNOME app launcher. | [Get started]({{ site.baseurl }}{% link getting-started.md %}) |
| Is there a shared server for company settings? | No. Setup is stored in files on each machine and in `.robos/` folders in your repositories. | [Company setup]({{ site.baseurl }}{% link existing-company-setup.md %}) |
| Does it include a model or an agent? | No. RobOS runs agent CLIs you install and sign in to yourself. | [Agent tiers]({{ site.baseurl }}{% link agent-tiers.md %}) |
| Does it read our identity provider? | No. The "Sync Directory" button in Group Manager writes sample data. | [Company setup]({{ site.baseurl }}{% link existing-company-setup.md %}) |
| What is planned but not built? | Listed on the roadmap. | [Roadmap]({{ site.baseurl }}{% link roadmap.md %}) |
