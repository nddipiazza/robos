---
title: Refinement evidence scope
layout: default
parent: Build on RobOS
nav_order: 10
---

# Refinement evidence scope
{: .no_toc }

How to validate an edit to an existing knowledge graph, such as a revised course, when other nodes in the graph have no source evidence. This is a reference for contributors who call `GraphWorkspace` from code.
{: .fs-6 }

## The problem

`GraphWorkspace.propose()` can require every node to carry `robos:evidence` (repository, path, line, revision and hash). With `requireEvidence: true` and the default scope, that applies to the whole graph. An old graph whose unrelated nodes have no evidence then fails validation even when you only changed one course.

## The option

`propose()` takes an `evidenceScope` option:

| Value | Meaning |
|:---|:---|
| `all` (default) | With `requireEvidence`, every node needs valid evidence. |
| `edited` | With `requireEvidence`, only nodes added or updated by the edits need evidence. Allowed only with `mode: 'refine'`. |

Any other value, or `edited` with another mode, throws "Evidence scope must be all, or edited for a refinement".

## Example

Run from a RobOS checkout:

```js
const { GraphWorkspace } = require('./packages/robos-graph/lib/graph-workspace');

const workspace = new GraphWorkspace(process.env.ROBOS_GRAPH_ROOT);
const proposal = workspace.propose({
  mode: 'refine',
  edits: [{ op: 'update', id: courseId, set: revisedCourseProperties }],
  requireEvidence: true,
  evidenceScope: 'edited',
});
if (!proposal.validation.conforms) {
  throw new Error(proposal.validation.errors.join('; '));
}
// Show the preview to the user, then apply the reviewed proposal.
workspace.apply(proposal, { expectedProposalId: proposal.id });
```

`courseId` and `revisedCourseProperties` are yours. Edit operations are `add` (with a `node`), `update` (with an `id`, properties to `set` and optionally keys to `unset`) and `remove` (with an `id`). Node ids cannot be changed by an update.

## What is checked

- Every node added or updated by the edits needs valid source evidence. Removed nodes are not checked.
- All nodes still get the structure, reference, shape and supplied-evidence checks.
- The scope is stored in the proposal's request, so `apply` and interrupted-write recovery derive the same scope again. `apply` also rejects a proposal whose content no longer matches its id.
- Import and replace proposals, and any caller that does not pass `evidenceScope`, keep the whole-graph requirement.

The `kgraph` CLI does not expose `evidenceScope`. Its `--require-evidence` flag always applies to the whole graph. For the rest of the workspace workflow, see [`WORKSPACES.md`](https://github.com/nddipiazza/robos/blob/main/packages/robos-graph/WORKSPACES.md).
