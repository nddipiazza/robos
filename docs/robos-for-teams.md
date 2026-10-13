---
title: RobOS for Teams
layout: default
nav_order: 6
has_children: true
has_toc: false
---

# RobOS for Teams
{: .no_toc }

Start here if you are a tech lead or evaluator deciding whether RobOS fits your team. These pages cover what problem RobOS targets, what is built today, and how a team sets it up.
{: .fs-6 }

## Evaluate

<div class="rb-links">
  <a class="rb-link" href="{{ site.baseurl }}{% link why-robos.md %}">
    <strong>Why RobOS</strong>
    <span>The problem, the approach, what exists in the repository, and the limits.</span>
  </a>
  <a class="rb-link" href="{{ site.baseurl }}{% link big-wins.md %}">
    <strong>What sets RobOS apart</strong>
    <span>The main RobOS features in more depth.</span>
  </a>
  <a class="rb-link" href="{{ site.baseurl }}{% link pr-review-theater.md %}">
    <strong>PR Review Theater</strong>
    <span>The staged pull request review.</span>
  </a>
  <a class="rb-link" href="{{ site.baseurl }}{% link agent-review-development.md %}">
    <strong>Review & governance</strong>
    <span>The section on reviewing agent work.</span>
  </a>
  <a class="rb-link" href="{{ site.baseurl }}{% link walkthroughs.md %}">
    <strong>Walkthroughs and proof of work</strong>
    <span>Recorded walkthroughs of RobOS apps.</span>
  </a>
  <a class="rb-link" href="{{ site.baseurl }}{% link architecture.md %}">
    <strong>Architecture</strong>
    <span>How the apps and libraries fit together.</span>
  </a>
</div>

## Set up a team

<div class="rb-links">
  <a class="rb-link" href="{{ site.baseurl }}{% link existing-company-setup.md %}">
    <strong>Company setup</strong>
    <span>For a team with existing repositories and a task tracker.</span>
  </a>
  <a class="rb-link" href="{{ '/new-company-setup.html' | relative_url }}">
    <strong>New company</strong>
    <span>For a team starting from nothing.</span>
  </a>
  <a class="rb-link" href="{{ site.baseurl }}{% link personas.md %}">
    <strong>Personas</strong>
    <span>Which apps to open first for four common jobs.</span>
  </a>
  <a class="rb-link" href="{{ site.baseurl }}{% link agent-tiers.md %}">
    <strong>Agent tiers</strong>
    <span>Which agent CLIs RobOS can run and which model settings do something today.</span>
  </a>
</div>

## Check before you adopt

| Question | Short answer | Details |
|:---|:---|:---|
| What platform does it need? | The install scripts use `apt` and register the Electron apps in the GNOME app launcher. | [Get started]({{ site.baseurl }}{% link getting-started.md %}) |
| Is there a shared server for company settings? | No. Setup is stored in files on each machine and in `.robos/` folders in your repositories. | [Company setup]({{ site.baseurl }}{% link existing-company-setup.md %}) |
| Does it include a model or an agent? | No. RobOS runs agent CLIs you install and sign in to yourself. | [Agent tiers]({{ site.baseurl }}{% link agent-tiers.md %}) |
| Does it read our identity provider? | No. The "Sync Directory" button in Group Manager writes sample data. | [Company setup]({{ site.baseurl }}{% link existing-company-setup.md %}) |
| What is planned but not built? | Listed on the roadmap. | [Roadmap]({{ site.baseurl }}{% link roadmap.md %}) |
