---
title: Run evidence generation
layout: default
parent: Build on RobOS
nav_order: 9
---

# Run evidence generation
{: .no_toc }

How to run the evidence generator from the command line instead of from PR Review. It is for contributors who want to produce or refresh a review's evidence bundle in a script.
{: .fs-6 }

## What it is

The generator lives in `packages/robos-lib/evidence-runner.js`. `packages/pr-review/lib/evidence-runner.js` re-exports it for PR Review. The library has no Electron dependency.

Given a plan, it starts a Codex agent in the review's workspace and asks it to run each planned check and save the real inputs, outputs and exit codes. It streams progress, binds the captured files to the selected evidence template, and saves a bundle that records the SHA-256 hash of each artifact and the Git revision that was tested.

It needs the Codex CLI. The runner starts the executable named in `review.json` with Codex flags (`-a never`, `--sandbox danger-full-access`, `--output-schema`, `--output-last-message`), so a different agent will not work.

{: .warning }
The agent runs with `--sandbox danger-full-access` in the workspace, with your filesystem and network access. The prompt tells it not to edit product code, commit, push, deploy, publish, contact people, mutate production or close issues. Those are instructions to the model, not a sandbox boundary. Use a review configuration you trust.

## Generate evidence

```bash
node packages/robos-lib/evidence-runner-cli.js \
  --review /absolute/path/review.json \
  --plan /absolute/path/evidence-plan.json \
  --output-dir /absolute/path/new-evidence-run
```

`--output-dir` must not exist yet. The CLI creates it and refuses to reuse one, so earlier captures are never replaced. Run the command with `--help` to print the usage text.

| File | Fields |
|:---|:---|
| `review.json` | `workspace` (an absolute path to a Git checkout), `title`, and `demoAgent` with an absolute `command` and `args` that start with `exec`, normally `["exec", "--json"]`. |
| `evidence-plan.json` | `markdown` (the plan text), `scenarios` (a list of objects with `id` and `title`), and `template` (the selected evidence template). |

Evidence template definitions and bundle validation are in `robos-lib` (`evidence-templates.js`, `evidence-bundle.js`).

### Output and exit codes

The CLI writes progress to stderr and a JSON summary to stdout. The full result is `evidence-run.json` in the output directory, and captures are under `evidence/runs/<run-id>/`.

| Exit code | Meaning |
|:---|:---|
| 0 | The run completed and every check passed. |
| 2 | The run completed but some checks need attention. |
| 1 | An execution or configuration error. |

A scenario with no result, or a required template slot with no capture, is marked blocked and cannot pass. Ctrl-C stops the run; partial captures are kept and are not marked verified.

## Call it from an app

Construct `new EvidenceRunner(review, { directory })`, subscribe to its `state` event, and call `start(plan)`. `stop()` cancels the run. PR Review reads a saved bundle through `packages/pr-review/lib/task-evidence-view.js` and renders it with the shared components in `packages/robos-ui/evidence-template.js`.

## Refresh a bundle without rerunning tests

To change how existing evidence is presented:

```bash
node packages/robos-lib/evidence-template-cli.js refresh \
  --bundle /absolute/path/original-bundle.json \
  --workspace /absolute/path/worktree \
  --output /absolute/path/refreshed-bundle.json
```

This revalidates the artifact hashes and the Git revision, keeps the original capture dates, and labels the result as presentation-only with the note "Existing captures revalidated; tests were not rerun." It does not create new proof.

The same CLI has other subcommands: `list`, `select`, `register` and `collect`.
