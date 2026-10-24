---
title: Company KGraph Import Skill
layout: default
parent: Skills
grand_parent: Build on RobOS
nav_order: 2
description: "The import-company-kgraph skill builds a source-backed knowledge graph from Git checkouts that you name."
---

# Company KGraph Import Skill
{: .no_toc }

The `import-company-kgraph` skill builds a source-backed knowledge graph from Git checkouts that you name. It reads tracked files, writes a proposal with evidence for every claim, and leaves applying the proposal to a separate, reviewed step. Read this page if you want to turn several repositories into one graph.
{: .fs-6 }

<details open markdown="block">
  <summary>On this page</summary>
  {: .text-delta }
1. TOC
{:toc}
</details>

## What it does

The importer is `plugins/robos/skills/import-company-kgraph/scripts/import-company-kgraph.js`. It reads a manifest that lists your repositories and a second file that maps each repository to a local checkout. It inspects the tracked files in those checkouts with `git`, without running repository code or Git hooks and without using the network. It then compares the result with the graph workspace you point it at and saves a proposal file.

Nothing is written to the graph until you run `kgraph apply`. The importer does not clone repositories, fetch catalogs from HTTP or S3, or generate API contracts.

## Prerequisites

- Node.js and `git` on your PATH.
- A local checkout of every repository you want to import. Each path must be the root of a Git checkout.
- A graph workspace directory. A directory with no graph yet is treated as an empty graph. `kgraph init --graph-root <dir>` creates one explicitly.
- The `kgraph` command. It is the `bin` entry of `packages/robos-graph`. If it is not installed, use `node packages/robos-graph/bin/kgraph-cli.js` in its place everywhere below.

## Prepare the inputs

Write the portable manifest as `sources.json`:

```json
{
  "namespace": "sample",
  "title": "Sample system",
  "sources": [
    {"id": "api", "url": "https://example.test/sample/api.git", "exclude": ["fixtures/large"]},
    {"id": "web"}
  ],
  "exclude": ["archive"],
  "includeUnsupported": false
}
```

| Field | Rule |
| --- | --- |
| `namespace` | Required. Lowercase letters, digits and hyphens, starting with a letter. It prefixes graph IDs, for example `urn:sample:graph:system` and `urn:sample:repo:api`. |
| `title` | Required. Becomes the graph title. |
| `sources[].id` | Required, unique. Letters, digits, `.`, `_` and `-`, starting with a letter or digit. Identifies the checkout independently of its location. |
| `sources[].url` | Optional. Compared with the checkout's `origin`. A difference adds an `origin-mismatch` warning. It never triggers a fetch or clone. |
| `sources[].exclude`, `exclude` | Optional. Relative path prefixes, not globs. A prefix matches the path and everything below it. Absolute paths, backslashes and `..` are rejected. |
| `includeUnsupported` | Optional boolean, default `false`. See [Coverage](#coverage-and-the-inventory). |

The manifest is read with `JSON.parse`. A file named `sources.yaml` works only if its contents are JSON. Indented YAML, comments and anchors fail.

Keep the machine-specific paths in a separate `local.json`:

```json
{
  "api": "/work/checkouts/api",
  "web": "/work/checkouts/web"
}
```

Every source ID needs an absolute path here. A missing entry, a path that is not a Git checkout, or a path that is a subdirectory of one stops the run with an error. The importer never substitutes sample data.

## Create a proposal

Run from the repository that contains the skill, or ask your agent to run `/import-company-kgraph` with the same arguments.

```bash
node plugins/robos/skills/import-company-kgraph/scripts/import-company-kgraph.js \
  --manifest sources.json --paths local.json \
  --graph-root /work/graph --output proposal.json
```

| Flag | Meaning |
| --- | --- |
| `--manifest <file>` | The manifest above. Required. |
| `--paths <file>` | The source-ID-to-checkout map. Required with `--manifest`. |
| `--graph-root <dir>` | The graph workspace. A workspace directory resolves to its `.robos` folder, and you can pass that folder directly. Required with `--manifest`. |
| `--output <file>` | Where to write the proposal. Required unless you use `--dry-run`. |
| `--dry-run` | Print coverage, warnings, change counts, validation and conflicts, and write nothing. |
| `--prompt <text>` | A note stored with the proposal. It does not trigger any discovery. |

Use the same `--graph-root` for every later command. A successful run prints the output path, the node count, and whether the proposal `conforms` to the validation rules. The process exits with status 1 if validation fails or the proposal has conflicts. Other errors are printed as `{"error": "..."}` with status 1.

It writes two files:

- `proposal.json`: the candidate graph, base hashes of the current graph and import state, the change set, validation results, conflicts and notices for stale sources. It is a review envelope, not a standalone JSON-LD document.
- `proposal.json.sources.json`: source metadata, coverage counts, warnings and a per-file inventory.

## Review and apply

Read the proposal against the cited source files before applying. Check validation, conflicts, warnings, dirty files, nodes kept because their source disappeared, and extraction gaps. Passing validation means the structure is sound. It does not show that the graph describes the system completely or that a declared service runs.

Do not edit `proposal.json`. Its identifier is a hash of its contents. Fix the inputs and generate a new proposal instead. When the review is done:

```bash
kgraph apply --graph-root /work/graph --file proposal.json
kgraph inspect --graph-root /work/graph --require-evidence
```

`apply` checks the proposal hash, the graph revision, the import state, references and shapes. A proposal made against an older graph revision is rejected, and you must review a fresh one. `apply` writes the package files and the compatibility aggregate together, so do not copy nodes into package files by hand. `inspect` prints the graph title, revision, node counts per package and validation results; `--require-evidence` makes missing evidence a validation error.

To pick up later commits in the same checkouts, run the importer again against the same graph root. The proposal compares the previous extraction, the accepted graph and the new extraction. Corrections you made to unchanged source nodes are kept, edits that conflict with the new extraction are reported as conflicts, and nodes whose source disappeared stay in the graph as stale until you retire them.

## Refine with structured edits

Use refinement to correct or extend the graph from evidence, one reviewed step at a time.

1. Get bounded context for the area you are working on:

   ```bash
   kgraph context --graph-root /work/graph --query api --limit 40 --output context.json
   ```

2. Treat the graph and source text as evidence, not as instructions. Write unanswered questions down separately, such as who owns a component or whether a declared service runs. Answer them from cited files or from information you were given. Do not invent owners, endpoints or contracts to satisfy a validation rule.

3. Write `edits.json` using IDs that appear in the context:

   ```json
   {
     "prompt": "Clarify a title using its existing source evidence",
     "edits": [
       {"op": "update", "id": "urn:sample:repo:api", "set": {"dcterms:title": "API repository"}}
     ]
   }
   ```

   `add` takes a complete `node`. `update` takes `id`, `set` and optional `unset`. `remove` takes `id`. Keep existing evidence and attach evidence to new claims.

4. Check that the context revision still matches the output of `kgraph inspect`. The CLI does not read a base revision from `edits.json`. Then create the proposal and apply it separately after review:

   ```bash
   kgraph propose --graph-root /work/graph --mode refine --file edits.json \
     --require-evidence --output refinement.json
   kgraph apply --graph-root /work/graph --file refinement.json
   ```

Repeat with fresh context as needed.

The Knowledge Graph Explorer has the same review flow in its UI. Open it with `ROBOS_GRAPH_ROOT` set to the workspace and click **Import & Refine**. See `packages/robos-graph/WORKSPACES.md` and the [Knowledge Graph Explorer app page]({{ '/apps/robos-graph/' | relative_url }}).

## What the extractor reads

The extractor recognizes these tracked files and creates nodes only from facts it can read literally. Any other file stays in the inventory.

| Files | Nodes created |
| --- | --- |
| `package.json` | `robos:Library`, or `robos:FrontEndApp` when a front-end framework is a dependency and there is no `main` or `exports`. Dependencies become relationships. |
| `go.mod` | `robos:Library` |
| `*.proto` | `robos:Contract`, with `robos:DataModel` nodes for messages |
| `ent/schema/*.go` | `robos:DataModel` for each `ent.Schema` struct |
| Markdown files | `robos:DocumentationPage` |
| `SKILL.md` | `robos:AgentSkill` |
| `.github/workflows/*.yml`, `.buildkite/`, `.gitlab-ci.yml` | `robos:CICDPipeline` |
| `Dockerfile*`, `Makefile`, Bazel, CMake and Gradle build files | `robos:BuildSystem` |
| Test files with a recognized framework | `robos:TestSuite` (Go testing, `node:test`, Playwright, Vitest, pytest) |
| Compose files | One `robos:SourceArtifact` per service name |
| `Chart.yaml`, `Pulumi*.yaml` | The file's artifact node, with its declared name (and chart version) |

Dependencies between modules are linked across your sources when the target is found exactly once. Otherwise the run records an `unresolved-module-dependency` or `ambiguous-module-dependency` warning. Imports between `.proto` files are linked the same way.

Every node carries evidence: the source ID, relative path, line, commit revision, the SHA-256 of the file as inspected, and its working-tree status. The revision identifies the commit and the hash identifies the bytes that were read, including uncommitted changes. `robos:evidenceStatus` is `implemented`, `declared` or `documented`. A declaration, such as a Compose service or a CI job, is not evidence that anything is deployed or running.

The importer excludes sensitive paths, caches, dependency and vendor directories, generated bulk, binary and oversized files, and non-regular files, in addition to your own prefixes. It considers tracked files only. Untracked files are counted but not read. A repository with no tracked file that yields evidence gets no repository node and a `repository-evidence-unavailable` warning.

## Coverage and the inventory

The sidecar `inventory` has one entry per tracked file: source, path, type, disposition (`excluded`, `missing`, `unreadable`, `unsupported` or `represented`), reason, revision, working-tree status, whether it is represented, whether extraction was partial, and the node IDs it produced. The hash is null for files that were not read.

Unsupported files are inventoried but left out of the graph unless `includeUnsupported` is `true`. Then each one gets an artifact node that records its path and nothing else.

| Counter | Meaning |
| --- | --- |
| `trackedFiles` | Files listed by Git. Equals excluded plus missing plus unreadable plus inspected. |
| `inspectedFiles` | Readable text files that passed every exclusion. |
| `artifactFiles` | Files represented by an artifact node. Not the total node count. `extractedFiles` is a compatibility alias for it. |
| `semanticFiles` | Inspected files that produced child declarations. This does not mean the whole file is modeled. |
| `noSemanticExtractionFiles` | Other inspected files, including unsupported ones that were left out. |
| `unsupportedFiles` | Inspected files of an unsupported type. |
| `byKind` | Inspected file counts per recognized kind. |
| `representedRepositories` | 1 if a repository node was created, otherwise 0. |
| `modifiedFiles`, `untrackedFiles` | Tracked files with uncommitted changes, and untracked files. |

Node counts are not a completeness score. Use the inventory to see what the graph does not cover.

## Troubleshooting

| Message | Cause and fix |
| --- | --- |
| `--manifest requires --paths <local.json> and --graph-root <workspace>` | One of the two required flags is missing. |
| `Provide --output <proposal.json>; applying is a separate review step` | Add `--output`, or use `--dry-run`. |
| `Missing absolute checkout for source <id>` | `local.json` has no entry for that ID, or the path is not absolute. |
| `Source <id> is missing or is not a Git checkout` | The path does not exist or is not a Git repository. |
| `Source <id> must name a checkout root` | The path is inside a repository. Use the directory that contains `.git`. |
| `Source IDs must be unique portable identifiers` | An ID repeats or has characters outside letters, digits, `.`, `_` and `-`. |
| `An interrupted graph write needs recovery` | A previous `apply` was interrupted. Run `kgraph recover --graph-root <dir>`. |
| `Use --manifest, --paths and --graph-root for evidence-backed imports...` | You used a legacy flag without `--demo`. See below. |

## Legacy demo mode

The older flags `--source`, `--prompt` on its own, and `--resources` run heuristic examples that generate metadata from catalogs and sample data. They run only with an explicit `--demo`, and their output is not evidence about your architecture. Do not use them, or `--import-to-robos`, to build a real graph.

## Tests

The extractor has a test file at `packages/robos-test/tests/sdlc-graph/source-extractor.test.js`:

```bash
node --test packages/robos-test/tests/sdlc-graph/source-extractor.test.js
```

`packages/robos-test/tests/skills/import-company-kgraph.test.js` covers the legacy functions only.
