# Human permission requests

Dev Central Notifications is the common inbox for human intervention. Login alerts offer a service-specific reconnect action; task permission alerts offer **Review request** to open the affected agent session. Opening or dismissing a notification does not grant permission or mark recovery successful.

Current integrations cover MCP OAuth, Slack credentials, GitHub authentication, agent credentials, and task-runner errors reporting administrator or agent-tool approval requirements. Ordinary build/network failures remain task errors. Requests from software outside RobOS are not intercepted.

Apps should use `robos-lib/auth-notifications` for service login incidents or `robos-lib/human-requests.report({taskUrl, kind, app})` for administrator/approval requests. The task runner also recognizes explicit permission errors through `reportError`. Notifications omit raw provider output and credentials. The linked session retains operation context. Resolution is recorded after verified service recovery or a successful task run; a UI click alone is not proof of success.

Both reporters use a shared, locked incident ledger to suppress repeated unresolved requests even if notification history is cleared. After recovery, a new failure can notify again. Dev Central watches the containing directory so atomic file updates continue to arrive.

Permission requests do not execute commands or approve tools. Where a provider cannot resume an approval interactively, review its session, correct the relevant configuration, and retry from the runner. Sandbox administrator requests do not authorize host sudo.
