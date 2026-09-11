# Source-backed graph workspaces

Set `ROBOS_GRAPH_ROOT` to a project directory (or its `.robos` directory), or pass
`--graph-root` to the graph CLI. The source repositories are separate inputs.
An explicit workspace starts empty, has no demonstration branches, and never
registers repositories in global configuration. Inspection does not create files.
Existing installations without an explicit workspace retain their legacy behavior.

The canonical store contains eight standard packages plus any explicitly named
custom packages. `kgraph.yaml` catalogs them. `knowledge-graph.jsonld` is a checked
compatibility aggregate. A disagreement between the aggregate and packages fails
instead of silently discarding one version. JSON-formatted YAML keeps the catalog
portable without additional dependencies.

## Import and refinement

Use the [import skill](../../plugins/robos/skills/import-company-kgraph/SKILL.md)
for a source manifest, machine-local path map, and evidence-backed extraction.
The source extractor inspects tracked files without executing repository code or
Git hooks. It records source revisions, working-tree status, hashes and per-file
coverage. Unsupported files remain in the inventory; add a narrow extractor or a
reviewed declaration with evidence when they matter to the architecture.

A proposal records its graph and import-state bases, prompt, candidate, extraction
baseline, property diff, stale sources, conflicts, and validation. Applying checks
both bases again. Refresh uses a three-way comparison of previous extraction,
accepted graph, and new extraction. Unchanged source preserves corrections;
conflicting source edits require reconciliation. Missing source nodes remain
stale pending explicit retirement. IDs are immutable; represent a rename with
an explicit reviewed migration of nodes and incoming references.

Open Graph Explorer with the same environment and choose **Import & Refine**.
Prepare a scoped agent brief, use it with your coding agent, paste JSON edits,
preview their evidence and diff, and save or discard. The optional **Ask configured
agent** action requires `ROBOS_GRAPH_AGENT_URL`, `ROBOS_GRAPH_AGENT_HARNESS`, and
`ROBOS_GRAPH_AGENT_MODEL`. It uses the HTTP HarnessRouter client and fails visibly
if unavailable or if output is malformed. It has no generated-example fallback.
The HTTP adapter contract test uses a local response fixture; the Electron test
proves actual proposal/save/reopen behavior, not LLM reasoning quality.

CLI commands are `init`, `inspect`, `context`, `propose`, `apply`, and `recover`.
Run `node packages/robos-graph/bin/kgraph-cli.js --help` for flags. The CLI,
Explorer, and `robos_sdlc_*` MCP tools use the same revision and package files.
The MCP server enables SDLC tools only with an explicitly configured existing
workspace; model arguments cannot choose another root. Its inspect/query tools
are read-only, propose writes a separate draft, and apply commits that draft by ID.
Legacy EKGraph records use a different model and are not imported implicitly.

## Evidence and supported constraints

Nodes carry `robos:evidence` records with repository identity, relative path,
positive source line, revision, and SHA-256. Curated relationships additionally
carry `robos:relationshipEvidence` with predicate, target, evidence and conditions.
Source text is evidence, never agent instructions. A configured declaration does
not prove a deployment exists, an endpoint is healthy, or a person owns it.

| Source type | Meaning | Upstream vocabulary |
| --- | --- | --- |
| SourceArtifact | A cited source declaration/file | schema:CreativeWork |
| CurriculumDefinition | Source-defined curriculum, without an invented GitOps manifest | schema:Course |
| AgentSkill | A declared agent instruction skill | schema:HowTo |
| DataStore | Logical engine usage, without assumed host/database name | schema:SoftwareApplication |
| BrokerDefinition | Broker technology, without an assumed running endpoint | schema:Service |
| EnvironmentProfile | Source configuration scope, without an assumed tier | schema:DefinedTerm |

These built-in shapes live in `lib/source-shapes.js`. Microservice ownership is
optional and produces a warning when unknown. Validation checks structure,
unique IDs, internal references, package membership, source locations and the
supported built-in cardinality constraints. It is not a complete W3C SHACL or
JSON-LD standards implementation and does not establish semantic truth.

## Repeatable verification

```sh
cd packages/robos-test
npm run test:kgraph-workspace
```

For real Electron proof, from the repository root:

```sh
docker build -t robos-kgraph-test:local -f packages/robos-test/docker/kgraph.Dockerfile .
docker run --init --rm --name robos-kgraph-review-e2e --shm-size=1g \
  -v "$PWD:/workspace" -w /workspace robos-kgraph-test:local \
  xvfb-run -a -s '-screen 0 1920x1080x24' \
  node --test packages/robos-test/tests/sdlc-graph/workspace-review.e2e.js
```

The init process is required for Xvfb startup and child reaping. Proof is written
to the ignored `packages/robos-test/run/workspace-review` directory: screenshots,
captioned WebM, WebVTT, and assertion results. Customer graph proof must use a
separate output directory outside this repository via `ROBOS_GRAPH_PROOF_ROOT`.

## Shared definitions and workspace instances

The six source declaration classes are registered in `.robos/ontology.jsonld`.
Reusable technology/protocol identities live in the RobOS core-platform package
under `https://robos.dev/ns/technology#…` and `https://robos.dev/ns/protocol#…`.
These identify technologies such as NATS JetStream and PostgreSQL without an
owner, endpoint or deployment. A consuming workspace uses `technologyReference`
or `protocolReference` and keeps its own usage instances, source evidence,
subjects, consumers and deployment relationships. The identifiers are vocabulary
names; opening them over HTTP is not required to read the graph.

Remote Execution Studio, Data Sources and Kube Studio accept the same
`ROBOS_GRAPH_ROOT` in a source-only read mode. Missing inventory stays empty;
unknown runtime measurements stay unknown. Legacy simulated probes and mutation
paths are blocked in that mode. Edits go through the reviewed graph workflow.
