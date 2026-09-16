---
name: pr-review-theater
description: Review a task-linked PR in RobOS using its diff, relevant validation evidence, optional training and explicit human merge approval.
---

# PR Review Theater

Open the task's linked PR in `packages/pr-review`. Review file changes immediately;
do not generate AI training, take a quiz or run local tests simply to enter review.

1. Inspect the actual diff and task plan. Use List/Tree navigation and inline
   comments or a focused AI fix through Task Runner when revisions are needed.
2. Assess relevant existing validation. Apply the change-scoped policy in
   `packages/robos-agent-client/validation-policy.js`. Prose-only README changes
   normally need diff/format/link inspection, not builds, browsers or e2e. Reuse
   valid passing checks for the same inputs/revision; do not repeat implementation
   validation merely because the workflow entered review. Add a targeted check
   only for uncovered risk or an explicit acceptance requirement. Missing proof
   for an inapplicable check is not a failed validation.
3. Generate or refine Summary & training only when requested, using the shared
   agent/model/effort selector. Training is optional and costs provider credits.
   Knowledge checks follow review; certificates gate merge only if organization
   policy explicitly requires them. Never lock diff inspection behind training.
4. Open associated IDEs only when useful for review. Do not start applications,
   services, debugger sessions or narrated recordings as a default review ritual.
5. Submit comments/change requests as authorized. Only explicit human approval
   may merge the reviewed commit, subject to required signoff, GitHub branch rules
   and prerequisite PR merge order. A review stage never grants merge authority.

Keep findings and validation notes concise. Do not fabricate successful checks,
claim skipped checks passed, or create per-ticket validation audit documents in
source repositories. Preserve raw run artifacts with the Task Runner session.
