---
title: Workspace preflight
layout: default
parent: "Review & governance"
nav_order: 4
---

# Workspace preflight
{: .no_toc }

Workspace preflight checks your Git checkout before an agent works on it. If the checkout has local edits or is not at the expected commit, it creates a separate worktree so the agent never touches your files. Today it is used by CI recovery in the PR review app.
{: .fs-6 }

## What it checks

[`packages/robos-lib/workspace-preflight.js`](https://github.com/nddipiazza/robos/blob/main/packages/robos-lib/workspace-preflight.js) exports two functions.

`inspect(workspace, revision, expectedBranch)` runs `git status --porcelain=v1 -z`, `git rev-parse HEAD` and `git branch --show-current`. It returns the changed files (status code and path, plus the old path for renames and copies) and `needsIsolation`, which is true when any of these hold:

| Condition | `reason` text |
|---|---|
| The status lists any staged, unstaged or untracked change | Your working copy has local edits. |
| `HEAD` is not the given revision | Your working copy differs from the failed PR revision. |
| `expectedBranch` is given and the current branch is different | Your working copy is on another branch. |

`prepare(workspace, revision, { root, expectedBranch })` does the following:

1. Rejects the revision unless it is a 40 to 64 character hexadecimal Git object name ("A verified Git revision is required.").
2. Runs `inspect`. When no isolation is needed, it returns the inspection result with `isolated: false` and stops.
3. Otherwise it confirms the commit exists with `git cat-file -e` and runs `git worktree add --detach` to create `ci-repair-<uuid>` under `root`. The default root is `~/.robos/agent-workspaces`, created with mode `0700`.
4. It writes `ci-repair-<uuid>.json` next to the worktree (mode `0600`) with `version`, `originalWorkspace`, `workspace`, `revision`, `createdAt` and `isolated: true`.

A detached worktree has its own index and files, so your branch, staged changes and untracked files stay as they were. The unit test [`workspace-preflight.test.js`](https://github.com/nddipiazza/robos/blob/main/packages/robos-test/tests/pr-review/workspace-preflight.test.js) checks that a repair commit leaves staged, unstaged and untracked files untouched.

```js
const { inspect, prepare } = require('../robos-lib/workspace-preflight');

const info = inspect('/path/to/checkout', failedCommitSha, 'my-feature-branch');
if (info.needsIsolation) {
  const repair = prepare('/path/to/checkout', failedCommitSha, { expectedBranch: 'my-feature-branch' });
  // repair.workspace is a detached worktree at failedCommitSha
}
```

## The preflight element

`workspace-preflight-ui.js` defines the custom element `<robos-workspace-preflight>`. Assign the `inspect` result to its `value` property. The element stays hidden unless `needsIsolation` is true. When shown, it displays "Keep your work. Repair in a clean workspace.", the `reason`, a collapsible "Existing local changes" list of status and path, and a note that the worktree starts at the failed commit and is kept so you can return to it.

## In the PR review app

CI recovery ([`packages/pr-review/lib/ci-recovery.js`](https://github.com/nddipiazza/robos/blob/main/packages/pr-review/lib/ci-recovery.js)) is available to the author of an open pull request whose CI has failed.

1. In the CI banner, click **Get CI back to green**. A dialog titled "Back to green" opens.
2. Choose the repair agent. Only Codex is supported, and it needs a configured Codex `exec` agent.
3. If the preflight reports that isolation is needed, the primary button reads **Use clean workspace & fix**. Otherwise it reads **Investigate & fix**. If you start a repair that needs isolation without confirming it, the app refuses with "Use a clean repair workspace to preserve your existing work."
4. The agent works in the repair worktree. Its prompt tells it to commit there, not to switch branches, edit the original checkout or push, and never to push, force-push, merge or open another PR.
5. When the agent has produced a verified commit, the button changes to **Push fix & watch CI**. Until then the dialog states "Your branch stays local until you push."

The recovery state, including the repair workspace path, is saved to disk. Reopening the dialog continues in the same workspace, and answers you give to the agent's questions are applied there. Your original index, branch and files are not changed by the repair itself.

{: .warning }
Not verified: pushing the repair commit when the repair ran in a separate worktree. CI recovery calls `ReviewPRState.push` with `workspace` and `expectedHead`, but that method in `packages/pr-review/lib/review-pr-state.js` takes no arguments and runs in the original checkout. There it requires the PR branch to be checked out and a clean tree, and it runs a plain `git push` without `--force`. The tests replace `push` with a stub, so this path has no test.
