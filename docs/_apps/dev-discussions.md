---
title: "Dev Discussions"
package: dev-discussions
category: core-desktop
icon: dev-discussions.svg
summary: "Discord/Slack-like work-item and PR review chat interface across Projects &rarr; Features &rarr; Tasks/PRs with smart caching."
---

Stop using generic team chat programs in your SDLC! **Dev Discussions** (`packages/dev-discussions`) brings the fluid, keyboard-driven ergonomics of Slack and Discord directly to your work items and pull requests:

- **Strict Domain Channel Tree**: Conversations are organized as **Projects &rarr; Features &rarr; Tasks & PRs**, eliminating fragmented channels and lost context.
- **Embedded PR Review Diffs**: Review code with syntax-highlighted diff hunks, file line anchors, and inline conversation resolution toggles.
- **Smart Caching Layer (<0.5ms reads)**: Loads full discussion trees from local cache instantly while protecting your team from GitHub and Jira REST API rate-limit exhaustion.
- **Knowledge Graph Synchronization**: Compiles all discussion threads, comments, review notes, and attachments into W3C SHACL-validated `robos:DiscussionThread` and `robos:Comment` nodes in the `organization` package.
- 👉 Read the complete guide: **[Stop Using Team Chat in Your SDLC: Context-First Work-Item & PR Discussions]({{ site.baseurl }}{% link big-wins/dev-discussions.md %})**.
