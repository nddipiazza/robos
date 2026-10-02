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

## Mention reviewers in a PR notification

Enable **Send PR review notification**, select its destination, and use
**Reviewers to @mention** to choose recipients. Defaults come from the project's
messaging settings in Git Projects. Search `@name` to find a person; the preview
shows who will be notified. The sender is excluded, and Slack receives stable
member-ID mentions rather than plain display names. Recipient changes here apply
only to this request. Save project defaults in Git Projects.

## Author mode after publication

Creating a PR reloads it from GitHub and compares its author with the connected
GitHub account. The author keeps the same evidence, diff, and walkthrough, with
an editable description and **Update PR** action while the PR remains open.
Use the walkthrough discussion for further changes, then **Push walkthrough
adjustments** in the top toolbar to publish the committed branch changes without
a force push. The command appears only for unpushed commits, disables while
pushing, and hides once the branch is up to date. New commits restore it
automatically; unfinished edits or a newer remote revision must be resolved first.

The Pull Request tab shows **Not Created**, **In Draft**, **In Review**,
**Merged**, or **Closed**, each with its own icon and color. **Reload PR**
refreshes the status and description. Closed/merged PRs and reviewer mode keep
the description read-only. If someone changes the description on GitHub during
editing, reload before saving rather than overwriting their work.

Buildkite checks use the shared CI connection to show actual job failures. In
CI recovery, **Read failure** loads the failed job logs directly. Missing token
access or a mismatched build commit is shown explicitly. Configure the connection
in CI Monitor; tokens are resolved from `pass`, never sent to the renderer.

### Live CI jobs and logs

**Jobs & live logs** opens an inline panel beneath the review toolbar. Buildkite
job states refresh every 10 seconds directly from the CI integration. Select a
job to follow its latest 64 KiB of output, refreshed every 3 seconds. Turn off
**Live** to pause requests or **Follow** to read earlier lines without automatic
scrolling. Closing the panel stops log polling. A changed PR revision clears
old selections, and failed refreshes explicitly mark output as potentially stale.

Monitoring never launches an agent. Agents stop after completing their local
repair; pushing a reviewed repair opens the CI panel so RobOS can show its
progress. An agent is used only when the reviewer requests investigation or fixes.

When moving a draft into review, **Request GitHub reviews** starts checked.
The reviewer list uses Git Projects defaults, falling back to the configured
RobOS Code Reviewers group. The PR author is excluded. Edits affect this request
only; unchecking the option disables the field and assigns no reviewers. Slack
notification remains a separate option.
