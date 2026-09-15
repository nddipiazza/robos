# Dev Central data

Normal launches read issues and pull requests directly from the selected GitHub
task server, activity from the local journal, features from
`~/.config/robos/dev-central-feature.json`, and notifications from the local store.
Missing features/activity and empty GitHub results stay empty. GitHub failures
are displayed as errors instead of being replaced with example data.

The task view defaults to all open issues in the configured repositories; choose
**Assigned to me** for a personal view. Unassigned and unlabeled GitHub issues are
supported. No export/re-import or label changes are required. Optional `state:`
and `priority:` labels control the corresponding filters and badges; unlabeled
issues use their GitHub open/closed state and display no invented priority.
The current GitHub fetch limit is 1,000 items per repository per list.

Review links open the actual GitHub issue or PR. Simulated proof, merge success,
and traffic generation are unavailable in normal use. Fixture data and those
demonstration actions require `ROBOS_DEMO_DATA=1`; `ROBOS_TEST` alone does not
activate sample data. Use a disposable HOME for demos to keep their saved data
out of a real workstation profile.

Validation:

```sh
node --test packages/dev-central/live-data.test.js
# With a normal Dev Central instance running and gh authenticated:
node packages/dev-central/live-data.e2e.cjs
```

## Assigned features and tasks

Assign to me adds the signed-in GitHub account without removing other assignments.
Dev Central reads all issue states from the selected task server. `Parent Feature:`
and `Depends on:` references in issue bodies supply the hierarchy and dependency
order. Missing or open dependencies block work; closed dependencies satisfy it.
Multiple unblocked tasks remain available for the developer to choose.

Titles open the existing Task Planner; descriptions appear on hover. Work ticket
opens the existing Task Implementer and starts planning when no approved plan
exists. The selected source workspace is required; a child task can inherit its
feature's workspace. Plan review remains in Task Planner. Implementation requires
approval of the exact plan and stops for human PR review.

The worker uses Codex by default with the user's existing authentication and model.
It prefers the desktop runtime (or ROBOS_CODEX_PATH) over an older standalone CLI.
Planning uses read-only mode; implementation uses workspace-write. Claude remains
an explicitly selectable backend in the worker API. Agent events and workflow state
persist under ~/.config/robos/work-tasks so closing the viewer does not stop work.
Provider errors are failures even when the CLI exits zero. AGY is not yet wired into
this workflow adapter.

Validation includes task dependency graphs, multiple assignments, provider event
parsing, workflow routing, and a live Electron/GitHub walkthrough. End-to-end PR
review and merging still require a completed implementation and human review.
