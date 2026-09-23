# Validating course revisions in existing graphs

Course preview must not require new provenance on unrelated, unchanged graph
records. For a course update, use the opt-in edited-node evidence scope:

```js
const proposal = workspace.propose({
  mode: 'refine',
  edits: [{ op: 'update', id: courseId, set: revisedCourseProperties }],
  requireEvidence: true,
  evidenceScope: 'edited',
});
if (!proposal.validation.conforms) {
  throw new Error(proposal.validation.errors.join('; '));
}
// Show the preview before applying the reviewed proposal.
workspace.apply(proposal, { expectedProposalId: proposal.id });
```

Every added or updated node must have valid source evidence. All nodes still
receive structure, reference, shape, and supplied-evidence checks. The same scope
is used at preview, apply, and interrupted-write recovery. Import/replace and
existing callers retain their whole-graph evidence requirement.

The locally customized course editor that exposed this bug is not yet part of
upstream RobOS. It should use the API above when integrated, rather than disabling
evidence checks or fabricating evidence for unchanged project records.
