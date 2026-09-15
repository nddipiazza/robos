# Populate RobOS apps from a company graph

In KGraph Editor, open **Import & Refine**, choose the company graph workspace, and select **Populate RobOS apps**.

1. **Task servers:** review the graph's connections, repository scope, and source evidence.
2. **Issue types:** retain graph definitions or discover GitHub organization issue types and type labels. Select the definitions to import.
3. **Issue workflows:** review states and transitions per type. The optional RobOS review template is an explicit configuration choice; GitHub labels do not imply transitions.
4. **Pipeline servers:** review provider, endpoint, credential reference, evidence, and linked pipeline files.
5. **Review import:** inspect counts and missing configuration, then import.

The final step saves reviewed type/workflow metadata on graph task-server nodes and merges local `task_servers` and `ci_pipeline_servers` settings. Re-import preserves server IDs, unrelated settings, existing authentication choices, and credential references. Concurrent graph/settings changes require a new preview. No credentials are read and no remote tickets, labels, assignments, builds, or agents are modified or launched.

Task Servers and Workflow Studio consume the imported definitions. Dev Central and the planning, implementation, and review apps use those task connections; this does not bulk-create local task plans. CI Pipeline Servers uses imported connections and existing graph pipeline definitions. Missing servers must first be added to the source graph. Automatic remote type discovery currently supports GitHub; other providers require graph definitions.

Graph format: `robos:TaskServer` nodes may contain JSON-valued `robos:issueTypes` (ID/label/optional native provider ID) and `robos:workflows` (type_id, states, transitions). Separate `robos:IssueType`/`robos:Workflow` nodes can be linked using `robos:taskServer`. CI nodes use `robos:CIPipelineServer`, `robos:provider`, `robos:url`, and `robos:credentialRef`, with pipeline nodes linked through `robos:ciServer`.

## Users and groups

The wizard has separate Users and Groups steps. Users accepts local Git checkout paths and optional Google Cloud project IDs. The email-domain allowlist accepts multiple comma/newline-separated domains (with optional @); matching is case-insensitive and exact. Blank includes all domains. Changing discovery inputs clears selections and requires rediscovery. The preview reports excluded identities. Groups use one explicit membership instruction per line: `Developers: person@example.com, another@example.com`. Only selected users are eligible. Preview and apply populate People Directory and Group Manager and record evidence-backed graph Person/Team nodes. The `import-users` skill documents source discovery and roster review.
