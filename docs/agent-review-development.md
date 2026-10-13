---
title: "Review & governance"
layout: default
nav_order: 4
has_children: true
permalink: /agent-review-development.html
---

# Review & governance
{: .no_toc }

How RobOS reviews code that an agent wrote: where the work is checked, what counts as evidence, and which parts of governance are not built yet. This section has four pages, listed at the end of this one.
{: .fs-6 }

## The delivery loop

An agent does the implementation. A person decides whether the result is good enough to publish and merge. The recording on the [RobOS home page](https://rowbose.com/) shows the whole loop; each step below names the app that owns it.

![A traditional workflow of four manual developer steps above a six-step agent review workflow where the human acts as lead architect]({{ '/assets/images/agent-review-workflow-comparison.jpg' | relative_url }}){: .robos-zoomable-img }
*Concept diagram from the original design docs. The text on this page says what is built today: for example, the review window has no merge button, and the author merges on GitHub.*

| Step | App | What happens |
|:---|:---|:---|
| 1. Plan | Task Explorer (`task-planner`) | An agent turns a goal into tracked issues with acceptance criteria. |
| 2. Implement | Task Implementer | An agent creates a feature branch (`codex/<task-key>` by default), implements and tests the task, commits and pushes. It does not open a pull request. |
| 3. Review locally | Review window, local review | The owner reads the diff on the Changes tab, checks the Evidence tab and takes the agent-led Walkthrough. |
| 4. Publish | Review window, Pull Request tab | The owner reviews the description and creates the PR, as a draft if they choose. |
| 5. CI | Review window | The CI banner shows check results. A draft can move to ready only when CI has passed. |
| 6. Approve | Review window, reviewer mode | A reviewer reads the diff and submits Approve, Request Changes or a comment through `gh pr review`. |
| 7. Merge | GitHub | The author merges. The review window has no merge button. |

The apps are described on their own pages: [Task Planner]({{ '/apps/task-planner/' | relative_url }}), [Task Implementer]({{ '/apps/task-implementer/' | relative_url }}) and [Agent Code Review & PR Review Theater]({{ '/apps/pr-review/' | relative_url }}).

## How review and proof of work fit together

The review window does not ask you to trust the agent's summary. It shows three kinds of evidence next to the diff:

- An evidence bundle recorded at one commit. When a new commit lands, the bundle is marked stale.
- Walkthrough checkpoints where an agent runs the changed behavior and pauses so you can try it.
- CI results read from GitHub and, for job logs, Buildkite.

Each is a signal for a person to weigh. The tool does not decide that a change is correct. Reaching the last walkthrough checkpoint does not approve or merge anything, and a PR can be created without completing the walkthrough.

## Known limits

- In reviewer mode, several tabs show built-in sample content rather than content from the PR, and by default the Changes tab and the Approve step stay locked until a fixed three-question sample quiz is passed. [PR Review Theater]({{ site.baseurl }}{% link pr-review-theater.md %}) lists which tabs use real data.
- The walkthrough and evidence agents are Codex CLI sessions, configured as `demoAgent` in the review's launch manifest. **Review branch…** sets it only when it finds a `codex` binary. Without one, those tabs have no agent to run.
- Recorded demos in the repository use sandbox data. The [Walkthroughs and proof of work]({{ site.baseurl }}{% link walkthroughs.md %}) page separates what the tests assert from what a recording only shows.
- Automatic selection of a model by task difficulty is not built. See [Agent tiers]({{ site.baseurl }}{% link agent-tiers.md %}).

## In this section

| Page | What it covers |
|:---|:---|
| [PR Review Theater]({{ site.baseurl }}{% link pr-review-theater.md %}) | The review window: tabs, how to open a review, creating and readying a PR, the walkthrough, and the launch manifest. |
| [Walkthroughs and proof of work]({{ site.baseurl }}{% link walkthroughs.md %}) | The review lifecycle recording and its test, how the demo recorder works, and a catalog of the recorded demo scripts. |
| [Agent tiers]({{ site.baseurl }}{% link agent-tiers.md %}) | What the Agent Tiers settings do today and what is not built yet. |
| [Workspace preflight]({{ '/workspace-preflight.html' | relative_url }}) | How an agent gets a clean checkout before a task that needs one. |
