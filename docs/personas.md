---
title: Personas
layout: default
parent: Company setup
grand_parent: RobOS for Teams
nav_order: 2
permalink: /personas.html
---

# Personas
{: .no_toc }

Which RobOS apps to open first for four common jobs on an engineering team. This is a grouping, not a permission system: any user can open any app.
{: .fs-6 }

RobOS does not assign roles to users. The role text that Group Manager can store in `~/.config/robos/identity.json` is shown on its identity badge and is read by no other app. Use the tables below to find the app for the job you are doing. Each app name links to its page, which says what works today.

## Tech lead or reviewer

| App | Use it to |
|:---|:---|
| [Agent Code Review Platform]({{ '/apps/pr-review/' | relative_url }}) | Review pull requests, including ones written by agents, in the staged PR Review Theater. See [PR Review Theater]({{ site.baseurl }}{% link pr-review-theater.md %}). |
| [Knowledge Graph Explorer]({{ '/apps/robos-graph/' | relative_url }}) | Browse the graph of services and contracts, and compare `main` with a branch. See [Knowledge graph]({{ site.baseurl }}{% link knowledge-graph.md %}). |
| [Dev Central]({{ '/apps/dev-central/' | relative_url }}) | See your tasks, pull requests and sprint board in one window. |
| [Agents Manager]({{ '/apps/agents-manager/' | relative_url }}) | Check which agent CLIs are installed and signed in, and which one is active. See [Agent tiers]({{ site.baseurl }}{% link agent-tiers.md %}). |

## Developer

| App | Use it to |
|:---|:---|
| [Git Projects]({{ '/apps/git-projects/' | relative_url }}) | Keep a list of repositories, clone and pull them, and open them in an IDE. |
| [Workspace Manager]({{ '/apps/workspace-manager/' | relative_url }}) | Find local workspaces and open them in an IDE. |
| [Issue Manager]({{ '/apps/issue-manager/' | relative_url }}) and [Task Board]({{ '/apps/task-board/' | relative_url }}) | Work through GitHub issues, and view work items as a board or a list. |
| [Task Implementer]({{ '/apps/task-implementer/' | relative_url }}) | Hand a task from a task server to an agent. |
| [App Wizard]({{ '/apps/app-wizard/' | relative_url }}) | Scaffold a new project, or register an existing folder. See [New app wizard]({{ site.baseurl }}{% link new-app-wizard.md %}). |
| [Relational DB Manager]({{ '/apps/db-manager/' | relative_url }}), [NoSQL DB Manager]({{ '/apps/nosql-manager/' | relative_url }}), [REST API Client]({{ '/apps/rest-client/' | relative_url }}), [gRPC Client]({{ '/apps/grpc-client/' | relative_url }}), [GraphQL Client]({{ '/apps/graphql-client/' | relative_url }}) | Query databases and call APIs while you work on a change. |
| [Skills Manager]({{ '/apps/skills-manager/' | relative_url }}) | Browse skills and copy their commands. See [Skills]({{ site.baseurl }}{% link robos-skills.md %}). |

## Platform or DevOps engineer

| App | Use it to |
|:---|:---|
| [CI Monitor]({{ '/apps/ci-monitor/' | relative_url }}) | List recent GitHub Actions runs and Buildkite builds, read failed-job logs, and re-run GitHub workflows. |
| [Pass Manager]({{ '/apps/pass-manager/' | relative_url }}) | Browse, add and copy entries in the `pass` password store. Task Servers and Group Manager point at `pass` paths. |
| [MCP Manager]({{ '/apps/mcp-manager/' | relative_url }}) | List the Model Context Protocol servers in `~/.config/robos/mcp/servers.json` and call their tools. |
| [Task Servers]({{ '/apps/task-servers/' | relative_url }}) | Store the connection details for Jira, GitHub Issues and other trackers. |

## Engineering manager or product owner

| App | Use it to |
|:---|:---|
| [Dev Central]({{ '/apps/dev-central/' | relative_url }}) | Watch sprint, pull request and blocker status. |
| [Task Planner]({{ '/apps/task-planner/' | relative_url }}) | Explore, plan and create tasks across projects and task servers. Its launcher name is RobOS Task Explorer. |
| [Group Manager]({{ '/apps/group-manager/' | relative_url }}) | Record teams as groups, with their repositories, onboarding steps and members. |
| [People Directory]({{ '/apps/people-directory/' | relative_url }}) | Keep a local list of people with contact and org fields. |

To set these apps up for a team, see [Company setup]({{ '/existing-company-setup.html' | relative_url }}) and [New company]({{ '/new-company-setup.html' | relative_url }}). For the full list of apps, see [Apps]({{ site.baseurl }}{% link apps.md %}).
