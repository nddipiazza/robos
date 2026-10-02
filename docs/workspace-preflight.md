# Agent workspace preflight

Use `packages/robos-lib/workspace-preflight.js` before a task that requires a clean Git checkout. Render the result with `<robos-workspace-preflight>` from `workspace-preflight-ui.js`.

1. Inspect the trusted workspace with the exact task revision and expected branch. Show the changed file list, including staged, unstaged and untracked files.
2. When isolation is needed, offer **Use clean workspace & fix**. Do not automatically commit, stash, discard or move the developer's edits.
3. After selection, call `prepare`. It rechecks the workspace and creates a detached worktree at the verified revision under `~/.robos/agent-workspaces`. Run the agent and validation there. Dependencies may need installation in that checkout.
4. Keep the repair checkout and its JSON record for resuming. Review the committed diff, then push only through an explicit action. Verify that the remote PR head has not changed and never force-push.

CI recovery uses this flow. It persists the repair workspace in its recovery state; reopening the review continues using that workspace. The original index, branch, working files and untracked files remain intact. A clean checkout at the expected revision and branch can be reused.
