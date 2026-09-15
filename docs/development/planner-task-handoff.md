# Planner to Task Runner handoff

GitHub task creation and re-sync send the configured native issue type through `gh --type`. RobOS type IDs are mapped to the configured GitHub names. New tasks default to Task, while feature/epic creation uses Feature. Unknown configured types fail before submission instead of creating an untyped ticket. Re-sync without a locally selected type leaves an existing server type unchanged.

Task inspection retains native issue type and labels, and imported Planner records receive the task/feature kind and native type. The runner loads the task server's workflow for that type.

A task description and acceptance criteria are requirements, not an approved implementation plan. Run Task opens launch settings only when the exact task plan has been approved in Task Planner. Otherwise Run is disabled, the missing prerequisite is explained, and one explicit Create/Review plan button opens Planner. Run never silently redirects there. Existing PRs use the primary Review PR action.

Verified with Hermetiq #62: re-submitted using Planner's Re-sync button, GitHub returned native type Task, and the runner displayed the Hermetiq Task workflow at Open. Its missing implementation plan remained an explicit prerequisite; no approval or agent run was fabricated.
