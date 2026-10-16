---
title: A day with RobOS
layout: default
parent: Use RobOS
nav_order: 3
---

# A day with RobOS
{: .no_toc }

One task, taken from a plan to a merged pull request and a follow-up task, using the RobOS apps. This page is a written version of the recording on the [home page](https://rowbose.com/), including which parts of that recording are real and which are scripted.
{: .fs-6 }

## The setup

The recording uses a small fixture project, `acme-corp/pawfinder-api`, a pet-adoption search API. The task is "Let adopters filter pet search by species, and show the best matches first". The whole run is about 143 seconds long and has 11 chapters.

It is produced by a script, not by hand: [`review-lifecycle-hero-demo.js`](https://github.com/nddipiazza/robos/blob/main/packages/robos-test/demos/review-lifecycle-hero-demo.js) drives the real Electron apps, with helpers in [`packages/robos-test/lib/lifecycle/`](https://github.com/nddipiazza/robos/tree/main/packages/robos-test/lib/lifecycle). The chapter list is in [`site/_data/hero.json`](https://github.com/nddipiazza/robos/blob/main/site/_data/hero.json).

| Part | Real | Scripted stand-in |
|---|---|---|
| Repository and tests | The git repository, its local "remote", the branch, commits, pushes and test runs | Nothing |
| GitHub | The apps' issue, PR and CI screens and flows | The `gh` command (`lib/lifecycle/bin/gh`) is a stateful fake. CI check results are set by the script. |
| Task planning | The Task Explorer screens and the issue-creation flow | The AI that drafts the tasks (`lib/lifecycle/plan.js`) |
| Coding agents | The commits, pushes and test runs they perform | `bin/claude` (Task Implementer) and `bin/codex` (review chat and walkthrough) are scripts. The edits they make are prewritten in the fixture (the feature, the removal of six comments, the species chips, the extra evidence case). No AI model writes code in the recording. |
| Evidence | Before and after results from calling `searchPets` on `main` and on the branch | Nothing |
| Merge | The merged state shown in the app | The merge itself: `gh pr merge --squash` against the fake forge |

Nothing is deployed in the recording. The last slide shows the sample app started locally with `node src/server.js` in a browser window.

## Walkthrough

### 1. Plan the task in Task Explorer

Chapter: Task created. App: RobOS Task Explorer, package [`task-planner`]({{ '/apps/task-planner/' | relative_url }}).

You type the goal into the prompt box and click **Generate with AI**. The planner returns an epic and a task. The task body holds acceptance criteria plus a happy-path, a negative and an edge case. Click **Sync All to Server** to file them. In the recording the epic becomes issue #41 and the task #42.

### 2. Implement it in Task Implementer

Chapter: Task implemented. App: [Task Implementer]({{ '/apps/task-implementer/' | relative_url }}).

Pick issue #42 from the list. The agent persona comes from the issue's `role:` label. Click **Start Agent**. The agent creates the branch `codex/42`, makes the change, runs the project's tests, commits and pushes. It does not open a pull request. The **Review branch…** button next to **Start Agent** hands the branch to the review app.

### 3. Review as the author in PR Review

Chapters: Owner reviews the changes, Owner checks the evidence, Owner takes the walkthrough. App: [Agent Code Review Platform]({{ '/apps/pr-review/' | relative_url }}), using the stages described on [PR Review Theater]({{ site.baseurl }}{% link pr-review-theater.md %}).

- **Changes** tab: a file tree and the full diff of the pushed branch, in unified or split view. **Suggest changes** opens a chat with an agent. In the recording the owner asks it to remove comments that only restate the code. The agent edits the file, runs the tests and commits, and the diff refreshes.
- **Evidence** tab: before and after results for each scenario, tied to one commit. The agent's new commit makes the existing evidence stale, so the owner asks for fresh evidence plus a new case that combines a text search with a species filter. Scenarios appear as the agent captures them.
- **Walkthrough** tab: click **Start**. An agent explains one checkpoint at a time and you click **Next step** to move on. Checkpoint 2 opens the running sample app in its own window. While it is open, the owner asks for species chips instead of a dropdown. The page reloads and the change is committed.

### 4. Open a draft pull request and wait for CI

Chapters: Draft PR created, Owner watches CI, Moved to ready for review.

In the **Pull Request** tab, tick **Create as draft** and click **Create PR**. The tab label shows the PR state, here "In Draft". **Refresh CI** reads the checks. The script moves them from pending to passing for `build`, `unit-tests`, `lint` and `contract-check`.

**Move PR to Ready** is refused unless the PR is a draft whose head matches the reviewed commit and its CI checks have passed. The dialog pre-fills reviewers from the project's review settings. Afterwards the tab shows "In Review".

### 5. Approve, merge, and start the loop again

Chapters: Reviewer approves, Owner merges, Owner watches CI and acts.

- A second window opens the same PR in **Reviewer mode**. The reviewer reads the diff and approves with notes. The reviewer-mode knowledge check holds placeholder content, so the recording answers it off camera.
- The script merges with `gh pr merge --squash`. After **Reload PR**, the tab shows "Merged".
- The script then sets the post-merge CI result on `main`: `contract-check` fails. The owner goes back to Task Explorer and files a follow-up, "Document the species query parameter in the OpenAPI spec", which becomes issue #44. That is chapter 1 again.

## Record it yourself

The recording needs `xvfb`, `ffmpeg`, Electron installed under `packages/robos-test/node_modules`, and a Chromium binary for the sample app window. Point `FAKE_CHROME` at that binary; the default path in `appwin.js` is `/opt/pw-browsers/chromium-1194/chrome-linux/chrome`.

```bash
xvfb-run -a -s "-screen 0 1920x1080x24" \
  node packages/robos-test/demos/review-lifecycle-hero-demo.js /tmp/hero
```

[`lib/lifecycle/README.md`](https://github.com/nddipiazza/robos/blob/main/packages/robos-test/lib/lifecycle/README.md) describes the next two steps, `compose.js` (cut dead time, add captions, encode) and `publish-hero.js` (copy into the front site).

## Related pages

- [Get started]({{ site.baseurl }}{% link getting-started.md %}): run the apps from a clone.
- [PR Review Theater]({{ site.baseurl }}{% link pr-review-theater.md %}): the review stages in detail.
- [Walkthroughs and proof of work]({{ site.baseurl }}{% link walkthroughs.md %}): recordings of other features.
- [Apps]({{ site.baseurl }}{% link apps.md %}): the app catalog.
