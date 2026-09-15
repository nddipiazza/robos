# Work-task desktop workflow

Dev Central is an assignment and navigation view. It reads real GitHub issues,
uses `Parent Feature:` and `Depends on:` body references to build the task order,
and offers every open task with satisfied dependencies. Assignments are additive.
No labels are required for the Hermetiq issue hierarchy.

Title links open the existing Task Planner. Work ticket opens the existing Task
Implementer. It prepares a plan only when none exists, resumes an active session,
and preserves a plan awaiting review. The human approves the exact plan in Task
Planner before implementation. Implementation opens Task Implementer and runs in
a dedicated Git worktree, leaving the source checkout's changes alone.

The worker uses Codex by default, with existing authentication and model settings.
`ROBOS_CODEX_PATH` overrides runtime discovery; the app runtime is preferred over
an older standalone CLI. Planning is read-only; implementation uses workspace-write
with networking for authenticated GitHub access. Git metadata may still require
separate publication through GitHub's API. No permission-bypass flags are used.
Claude remains supported through the worker API. AGY is not implemented here.

The task folder under `~/.config/robos/work-tasks/<url-hash>` holds the plan,
approval hash, workspace, phase, worker PID, logs and JSONL conversation events.
Closing or reopening the viewer does not stop the worker. A launch lock prevents
concurrent starts for a task. Explicit Stop terminates its worker subprocess.
Provider error events invalidate the run even if a CLI exits with status zero.

The worker re-reads linked open PRs when implementation ends. The existing PR
Review Theater loads the real PR description, checks, and diff. Its knowledge check
must pass before diffs are returned. Sign-off requires document/diff/evidence
review and rechecks the reviewed commit and GitHub checks before merging.
No checks, videos, diagrams, debugger results or graph merges are fabricated.
GitHub branch rules remain authoritative. The agent never approves or merges.

Tests cover dependency ordering, multiple workable leaves and assignments,
provider event parsing, routing, quiz gating, changed heads and merge verification.
Live walkthrough tests are in `packages/dev-central/task-flow.e2e.cjs` and
`live-data.e2e.cjs`; they require the desktop apps and authenticated Hermetiq access.
