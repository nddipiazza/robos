# Planner to Task Runner handoff

GitHub task creation and re-sync send the configured native issue type through `gh --type`. RobOS type IDs are mapped to the configured GitHub names. New tasks default to Task, while feature/epic creation uses Feature. Unknown configured types fail before submission instead of creating an untyped ticket. Re-sync without a locally selected type leaves an existing server type unchanged.

Task inspection retains native issue type and labels, and imported Planner records receive the task/feature kind and native type. The runner loads the task server's workflow for that type.

A task description and acceptance criteria are requirements, not an implementation plan. Run Task opens launch settings once the exact implementation plan has been saved in Task Planner. Approval is optional by default; explicit plan/both required-signoff settings require the named reviewer to approve that exact version. PR-only signoff does not block task launch. Otherwise Run is disabled, the missing prerequisite is explained, and one explicit Create/Review plan button opens Planner. Run never silently redirects there. Existing PRs use the primary Review PR action.

Verified with Hermetiq #62: re-submitted using Planner's Re-sync button, GitHub returned native type Task, and the runner displayed the Hermetiq Task workflow at Open. Its missing implementation plan remained an explicit prerequisite; no approval or agent run was fabricated.

## Draft a new task before creating its issue

New local tasks show the reusable AI textarea above the Markdown Monaco editor.
Each prompt refines the current plan; direct edits remain available. If the user
changes the task or Markdown while AI is working, the response cannot overwrite
those edits. Undo AI revision restores the previous Markdown when no intervening
edits exist.

The new-task Submit action saves the plan without inventing an approval. Only
explicit plan signoff requires the signed-in named reviewer. Submission sends the
native Task issue type and retains the exact plan in the runner session. The local Planner identity survives submission,
so implementation does not create a second, empty planning record. Submitting
opens the Tasks view with Implement Task available; execution still uses the
existing launch settings and ephemeral sandbox.

The missing-plan or required-signoff notice occupies a separate full-width row below the Task Runner header, outside the action buttons.
