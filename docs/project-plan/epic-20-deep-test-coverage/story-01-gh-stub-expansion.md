# Story 20-01: Expand gh CLI Stub with Issue/PR/Run Data

**Epic:** [Deep Test Coverage & Autonomous Verification](epic.md)
**Status:** Not started
**Points:** 8

## Description

Expand the bash stub at `packages/robos-test/sandbox/bin/gh` to return realistic JSON responses for all `gh` commands that RobOS apps actually invoke. The stub currently only handles `auth status`, `ssh-key add/list`, `auth login`, and `auth refresh`. All other commands hit the `*) exit 0 ;;` catch-all and return empty stdout, causing JSON parse failures.

### Commands to Stub (15+ patterns)

**Issue commands** (task-board, issue-manager, dev-central, manager-dashboard):
- `gh issue list` — JSON array of issues, respects `--state`, `--assignee @me`
- `gh issue view {N}` — single issue with comments
- `gh issue edit` — exit 0 (write-only)
- `gh label create` — exit 0 (write-only)

**PR commands** (pr-review, stage-demo, dev-central, manager-dashboard):
- `gh pr list` — JSON array of PRs, respects `--state`, `--author @me`, `--search`
- `gh pr view` — single PR detail or reviews/comments based on `--json`
- `gh pr diff --name-only` — newline-separated file paths
- `gh pr checks` — JSON array of check runs
- `gh pr review` — exit 0 (write-only)

**Run commands** (ci-monitor):
- `gh run list` — JSON array of workflow runs
- `gh run view --json jobs` — jobs with steps
- `gh run view --log-failed` — plain text failure log
- `gh run rerun` — exit 0 (write-only)

**API commands** (manager-dashboard):
- `gh api .../contributors` — contributor logins
- `gh api .../deployments` — deployment JSON

### Data Storage

Large JSON stored in `packages/robos-test/sandbox/data/` and `cat`'d by the stub:

```
sandbox/data/
├── issues-open.json         # 5 open issues
├── issues-closed.json       # 2 closed issues
├── issue-42.json            # Single issue with comments
├── prs-open.json            # 3 open PRs
├── prs-merged.json          # 2 merged PRs
├── pr-15-reviews.json       # Reviews and comments
├── pr-checks.json           # 3 check runs
├── pr-diff-files.txt        # 4 changed file paths
├── runs.json                # 4 workflow runs
├── run-1000-jobs.json       # Jobs with steps
├── run-1000-log-failed.txt  # Failure log text
├── contributors.txt         # 3 contributor logins
└── deployments.json         # 1 deployment
```

### Fake Data Conventions

- Repo: `acme-corp/buildbarn-forms`
- Authenticated user: `testuser`
- Collaborators: `alice-dev`, `bob-docs`
- Issue numbers: 25, 30, 35, 38, 42
- PR numbers: 12, 14, 15
- Run IDs: 998, 999, 1000, 1001

## Acceptance Criteria

- [ ] `gh issue list` returns valid JSON array of 5 issues with all fields apps request
- [ ] `gh issue list --state closed` returns 2 closed issues
- [ ] `gh issue list --assignee @me` returns only testuser-assigned issues
- [ ] `gh issue view {N}` returns single issue JSON with comments
- [ ] `gh issue edit` and `gh label create` exit 0 silently
- [ ] `gh pr list` returns 3 open PRs with full metadata
- [ ] `gh pr list --state merged` returns 2 merged PRs
- [ ] `gh pr list --author @me` filters to testuser PRs
- [ ] `gh pr list --search review-requested:@me` returns review-requested PRs
- [ ] `gh pr view` returns reviews/comments or full PR detail based on `--json`
- [ ] `gh pr diff --name-only` returns file paths
- [ ] `gh pr checks` returns check runs JSON
- [ ] `gh run list` returns 4 workflow runs with mixed statuses
- [ ] `gh run view --json jobs` returns jobs with steps
- [ ] `gh run view --log-failed` returns failure log text
- [ ] `gh api .../contributors` and `.../deployments` return expected data
- [ ] All existing tests still pass (no regressions)
