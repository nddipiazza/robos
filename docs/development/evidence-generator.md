# Run evidence generation without Code Review

The Code Review regeneration runner lives in `packages/robos-lib/evidence-runner.js`.
`packages/pr-review/lib/evidence-runner.js` re-exports it for existing callers.
The library has no Electron dependency. It runs the selected evidence plan through
Codex, streams public progress, binds captured files to the selected template,
and saves a bundle with artifact hashes and the tested Git revision.

```bash
node packages/robos-lib/evidence-runner-cli.js \
  --review /absolute/path/review.json \
  --plan /absolute/path/evidence-plan.json \
  --output-dir /absolute/path/new-evidence-run
```

The output directory must be new. Older captures are preserved.

`review.json` supplies `workspace`, `title`, and `demoAgent` with an absolute
`command` and `args` beginning with `exec` (normally `['exec', '--json']`).
`evidence-plan.json` supplies `markdown`, `scenarios` (`id` and `title`), and the
selected `template` object. Template definitions and bundle validation are also
in `robos-lib`; the template collector now imports the shared runner directly.

The agent executes in the workspace with local filesystem and network access.
Use a trusted local review configuration. Its evidence prompt forbids product
edits, commits, pushes, deployments, contacting people, and production mutations.
These are agent instructions, not a sandbox boundary.

The CLI writes progress to stderr and a result summary to stdout. Full results
are in `evidence-run.json`; captures are under `evidence/runs/<run-id>/`.
Exit status is 0 for completed checks, 2 for checks needing attention, and 1 for
execution errors. Missing scenarios and required template slots cannot pass.
Ctrl-C stops the run and retains partial captures without marking them verified.

For app callers, construct `EvidenceRunner(review, { directory })`, subscribe to
its `state` event, and call `start(plan)`. `stop()` cancels the run. The local Evidence tab reads the bundle through `task-evidence-view.js` and
renders the shared `robos-ui/evidence-template.js` components. Scenarios load
on expansion, with bounded text previews and optional full output.

To refresh presentation without rerunning tests:

```bash
node packages/robos-lib/evidence-template-cli.js refresh \
  --bundle /absolute/path/original-bundle.json \
  --workspace /absolute/path/worktree \
  --output /absolute/path/refreshed-bundle.json
```

This revalidates artifact hashes and the Git revision, preserves capture dates,
and labels the result as existing evidence. It does not create fresh test proof.
