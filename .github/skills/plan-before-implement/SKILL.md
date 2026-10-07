---
name: plan-before-implement
description: Create a reviewed project plan with linked GitHub features and tasks using RobOS Task Planner before implementation; view saved plans by task number or URL.
---

# Plan before implement

Use the requested repository and an explicit `ROBOS_GRAPH_ROOT`. Read the source
request and existing open/closed issues before creating work. Follow the team's
issue-creation skill for issue types, duplicate checks, native parent/dependency
links and notifications. Creating a plan is not approval to implement its projects.

Create a version 1 plan following `packages/task-planner/PROJECT-PLANS.md`. Include
owners, summary, design, verification, risks, source repository/path and ordered
items with exact issue URLs, types, delivery steps, parent URLs and dependencies.
Reuse existing issues. A GitHub Feature represents an epic when the organization
has no Epic type. Use `review-required` whenever design must be reviewed before code;
record an explicit approval URL before changing the plan to `approved`.

Write the issue for the person who will implement it: a short description of the
change, concrete delivery steps, and a few observable checks. Keep source hashes,
Figma node inventories, API access history, validation commands, and planner metadata
in the saved plan or reference files unless they are needed to act on the issue.
Do not paste the plan into the issue or repeat the same scope under several headings.
Use actual controls and behaviors: “Click Suggest changes to focus the text area,”
not “preserve contextual assistance affordances.” Titles describe the product change,
not the planning process. Honor the requested release size; keep related work together
when the user wants substantial releases rather than component-sized tasks.

In Task Planner, open **KGraph Project Plans**, expand **Create or update a linked
project plan**, paste the JSON, select **Preview plan**, inspect the delta and
validation, and **Save reviewed plan**. The same workflow is available headlessly:

```sh
node packages/task-planner/bin/project-plan.js propose --graph-root "$ROBOS_GRAPH_ROOT" --file plan.json --output proposal.json
node packages/task-planner/bin/project-plan.js apply --graph-root "$ROBOS_GRAPH_ROOT" --file proposal.json
```

Apply only after reading the proposed delta and validation. Saving changes the
explicit graph workspace; it creates no GitHub issues or implementation code.
Reopen the plan in Task Planner or select its project/task node in KGraph Explorer
and open **Project Plan**. Verify all linked issues and dependencies.

For “view plan for task 48”, run:

```sh
node packages/task-planner/bin/project-plan.js view 48 --repo OWNER/REPO --graph-root "$ROBOS_GRAPH_ROOT"
```

This reads the exact GitHub issue live and finds the saved plans containing it.
Distinguish live issue state from saved plan snapshots. Report missing plans or
GitHub access errors directly; do not invent a plan or mark work completed.
