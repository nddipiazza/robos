---
title: "Agent Code Review & PR Review Theater"
package: pr-review
category: code-review
icon: pr-review.svg
summary: "Autonomous AI pull request auditor, PR Review Theater, team KGraph policy, Show The Fix agent phase, and IDE bridges."
description: "Autonomous AI pull request auditor, PR Review Theater, team KGraph policy, Show The Fix agent phase, and IDE bridges."
related:
  - /pr-review-theater.html
---

Autonomous AI-driven code review, audit hub, and Review Theater for pull requests. Analyzes pull requests created by AI agents or human developers, provides side-by-side color-coded diffs, runs automatic security audits, tests OpenAPI contract compatibility, generates on-demand masterclasses with verified Knowledge Graph completion certificates, proves runtime correctness with 1080p narrated video proof-of-work teaching feature mechanics first followed by "Show Me The Fix" agent demonstrations, and connects directly with your preferred IDE via native plugins:
- **PR Review Theater**: Customizable multi-stage review pipeline (eLearning Knowledge Check, Living Docs, Diff Viewer, IDE Bridge, Evidence Video Proof-of-Work, "Show Me The Fix" Agent Guided Walkthrough, and Sign-Off & Dual Merge). Configurable per-team in `robos:Team` Knowledge Graph policy. Read the full guide in [PR Review Theater & Verification]({{ site.baseurl }}{% link pr-review-theater.md %}).
- **IntelliJ IDEA Pull Request Review Plugin**: Communicates over RobOS port `63343` IPC bridge and native JetBrains CLI integration to jump straight to modified files, set live breakpoints at change sites, and launch JetBrains' native Pull Request review tool window.
- **VS Code Pull Request Review Plugin**: Deeply integrates with the industry-standard `GitHub Pull Requests and Issues` extension (`vscode://github.vscode-pull-request-github/open-pr`) to review diffs, leave inline line comments, and approve PRs right inside Visual Studio Code.
![PR Review Theater]({{ '/assets/images/screenshots/pr-review-theater-02-pr-detail.png' | relative_url }})

## Author mode after publication

Creating a PR reloads it from GitHub and compares its author with the connected
GitHub account. The author keeps the same evidence, diff, and walkthrough, with
an editable description and **Update PR** action while the PR remains open.
Use the walkthrough discussion for further changes, then **Push walkthrough
adjustments** to publish the committed branch changes without a force push.

The Pull Request tab shows **Not Created**, **In Draft**, **In Review**,
**Merged**, or **Closed**, each with its own icon and color. **Reload PR**
refreshes the status and description. Closed/merged PRs and reviewer mode keep
the description read-only. If someone changes the description on GitHub during
editing, reload before saving rather than overwriting their work.
