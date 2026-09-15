---
description: Resume a GitHub task at its current RobOS workflow stage.
argument-hint: https://github.com/OWNER/REPO/issues/NUMBER
---

Run the RobOS Agent dispatcher for the supplied task URL:

```bash
bash packages/robos-agentd/robos-agent /work-task "$ARGUMENTS"
```

The dispatcher reads live GitHub workflow state. Linked draft/open PRs open
PR Review Theater. Otherwise an open task opens Task Planner for plan review
and refinement. Closed tasks without open PRs are complete. Preserve existing
plans and running work; do not infer workflow from example data or labels alone.

In Task Planner, the human reviews/refines the plan and approves the exact plan
before starting background implementation. Agents must leave a draft PR linked
to the task and stop for PR Review Theater. Only a human's explicit approval in
PR Review Theater can merge the reviewed commit; never autonomously merge.
