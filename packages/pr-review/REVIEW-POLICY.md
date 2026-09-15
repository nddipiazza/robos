# PR review and knowledge checks

Review the overview, documentation, file diffs, optional IDE comparison, and validation evidence before taking the knowledge check. Diffs and IDE access are available immediately. The knowledge check follows the review and tests comprehension of the reviewed PR.

Completion certificates are optional by default, including for Hermetiq. In **Review & merge → Organization review policy**, enable **Require a completion certificate before merge** to require an 80% passing score for that organization. With the option off, reviewers can skip the quiz and proceed to sign-off after reviewing documentation, diffs, and evidence.

The setting applies to repositories owned by that organization on this RobOS installation. It is persisted in `~/.config/robos/pr-review-policies.json`, keyed by the lowercase GitHub owner. It is a local RobOS policy, not a centrally enforced GitHub organization rule. The backend rechecks the current setting when merging and uses its own quiz result for the reviewed commit; a renderer-provided passed flag cannot satisfy the requirement.

GitHub checks, branch rules, and commit matching continue to apply regardless of the certificate setting. Reloading a PR starts a fresh review. Changing the PR head requires reviewing the new commit before merge.
