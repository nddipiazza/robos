---
title: "Agent Code Review & PR Review Theater"
package: pr-review
category: code-review
icon: pr-review.svg
summary: "Review window for a pull request or a local agent branch, with a seven-step reviewer flow, links into IntelliJ and VS Code, and author tools for creating and updating the PR."
description: "Opens a task, a PR URL or a saved local review, and walks through overview, documentation, changes, IDE, evidence, walkthrough and approval. This page covers the app; the review flow itself is described in the PR Review Theater guide."
related:
  - /pr-review-theater.html
---

This is the app behind the review flow described in [PR Review Theater]({{ site.baseurl }}{% link pr-review-theater.md %}). It reads pull requests with the `gh` CLI, so it needs `gh` signed in and a GitHub task server (see [Task Servers]({{ '/apps/task-servers/' | relative_url }})).

For how this app fits with the others when you build an app, see the Build apps guides: [on your own](/build-apps/solo/) or [as a team](/build-apps/teams/).

## How it opens

| Start | What you get |
|---|---|
| No environment variables | A task picker. It lists saved local reviews from `~/.robos/local-reviews/<name>/review.json`, which [Task Implementer]({{ '/apps/task-implementer/' | relative_url }}) creates through its **Review branch...** button. |
| `ROBOS_REVIEW_URL=<pull request URL>` | That pull request, loaded through `gh`. |
| `ROBOS_LOCAL_REVIEW=<path to review.json>` | A local review of an agent's branch before any PR exists. |

Run it from the launcher (**Agent Code Review Platform**) or with `npm start` in `packages/pr-review`. Dependencies are built in the package's `postinstall` step.

## The review steps

The stepper along the top has these stages: **Description**, **1 Overview**, **2 Documentation**, **3 Changes**, **4 Open in IDE**, **5 Evidence**, **6 Walkthrough**, **Pull Request** and **7 Approve**. In the code the stages are a reviewer knowledge check, a living architecture guide, an in-app diff viewer, an IDE bridge and breakpoint session, an evidence and video canvas, an agent-guided walkthrough, and sign-off. The window warns that you must pass the knowledge check with at least 80% before the later steps. A team can adjust this through the PR Theater configuration, so the guide is the reference for what is enforced.

## IDE links

- **IntelliJ IDEA:** the app contacts a RobOS IntelliJ plugin on `localhost:63343` when one is running, and otherwise starts IntelliJ with the `idea` command.
- **VS Code:** it opens `vscode://github.vscode-pull-request-github/open-pr?number=<n>&repo=<owner/repo>`, which needs the GitHub Pull Requests and Issues extension.

## Publishing and CI

- **Author tools.** For a local review, **Create PR** creates the pull request from the branch. The Pull Request step shows the PR as **Not Created**, **In Draft**, **In Review**, **Merged** or **Closed**. **Update PR** edits the description while the PR is open, **Reload PR** refreshes it from GitHub, and **Ready for review** takes a draft out of draft. **Push walkthrough adjustments** pushes new commits without a force push. **Request GitHub reviews** and an optional chat notification (**Send PR review notification to ...**, with workspace, channel and reviewer pickers and a preview) are options when you move a draft into review.
- **Buildkite CI.** When a PR has Buildkite checks, **Jobs & live logs** opens a panel under the toolbar. Job states refresh every 10 seconds. Selecting a job shows the latest 64 KiB of its log, refreshed every 3 seconds while **Live** is on. Turn off **Follow** to stop auto-scrolling. In CI recovery, **Read failure** loads the failed job's log. Monitoring does not start an agent.
