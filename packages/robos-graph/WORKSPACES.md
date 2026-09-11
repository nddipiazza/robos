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

## Classification catalog and viewer tree

The Explorer opens in **Classification** mode. Package, exact RDF type, and flat
views remain available. The classification, type, and package filters combine;
search includes node fields, types, classification labels, status, and warnings.
Each node appears once, under its first category in catalog order, even when it
has several types. All inferred memberships remain visible and searchable, and
filtering by any membership finds the node. Counts represent matching nodes,
including collapsed children. Search temporarily expands matching groups and
clearing it restores the prior collapse state. Collapse state is separate for
each grouping mode. Unknown custom types stay visible under **Unclassified**,
with an actionable warning; an explicitly classified custom type also retains
its unknown-type warning.

[`lib/classification.js`](lib/classification.js) is the single implementation for
Node and the browser. It contains the RobOS-owned code set, exact class and
alternate SHACL target memberships, registered predicate metadata, resolution,
and deterministic tree construction. There are no package-name or type-substring
classification heuristics. `SourceArtifact` declarations, including
`sourceKind: protobuf-enum`, infer the source-control/artifact category.
The explicit `schema:CreativeWork` mapping also identifies authored artifacts.
When a more specific registered type is present, that type takes precedence
(for example, `AgentSkill` remains in Agents). Unregistered types still warn;
there is no catch-all mapping for arbitrary Schema.org or custom types.

The vocabulary follows Schema.org's [CategoryCode](https://schema.org/CategoryCode),
[CategoryCodeSet](https://schema.org/CategoryCodeSet),
[codeValue](https://schema.org/codeValue), and [inCodeSet](https://schema.org/inCodeSet).
Schema.org provides the vocabulary; **these SDLC codes are RobOS-owned, not a
Schema.org SDLC taxonomy**. Because [schema:category](https://schema.org/category)
lists a narrower set of applicable types, the ontology declares the general
`robos:classification` property as its subproperty, with `rdfs:Resource` domain
and `schema:CategoryCode` range.

An explicit classification uses a registered code reference, not a free-text
label. The local JSON-LD context should coerce these references as IDs:

```json
{
  "@context": {
    "robos": "https://robos.dev/ns/sdlc#",
    "robos:classification": {
      "@id": "robos:classification", "@type": "@id", "@container": "@set"
    }
  },
  "@id": "urn:example:component:catalog",
  "@type": "example:Catalog",
  "robos:classification": [
    { "@id": "https://robos.dev/ns/sdlc#classification/data" }
  ]
}
```

`resolveClassification(node)` returns:

| Field | Meaning |
|---|---|
| `status` | `declared`, `inferred`, or `unclassified` |
| `valid` | False for malformed/unknown explicit references or stale persisted inference; unknown custom types alone are warnings |
| `categories` / `references` | Effective catalog entries / canonical JSON-LD ID references |
| `inferredReferences` | Class-derived references independent of an explicit override |
| `primary` | First effective code in catalog order, or `unclassified` |
| `unknownTypes` / `warnings` | Unregistered types and structured diagnostic codes/messages |

Absent classification is inferred without modifying the input. Explicit valid
references override class inference; invalid declarations stay Unclassified and
never silently fall back. URI strings and ID-only objects, singular or arrays,
are accepted. Compact `robos:` references and full namespace IRIs resolve to the
same code. Unknown external/custom code URIs are invalid; custom types can use
any registered RobOS code. To extend the taxonomy, update the catalog and its
coverage tests deliberately.

A refresh that deliberately materializes class inference must also store
`robos:classificationOrigin: "inferred"`. The resolver preserves that status and
checks the stored references against current class inference. A mismatch returns
`valid: false` with `stale-inferred-classification`; a refresh must resolve that
explicitly. User-declared references omit the origin marker or use `"declared"`.
Opening or filtering a graph does not persist inferred values.

`resolveSchemaElement(id)` returns references for registered classes, shape IDs,
and predicates. Every built-in shape and property rule carries classification
metadata. Predicate classifications use the owning shape categories where
available; explicitly registered cross-cutting predicates use the schema/graph
metadata category. The catalog does not define dependency semantics.
`buildTree(nodes, { mode, search, classification, type, package, collapsed })`
returns sorted entries and groups, matching/total counts, and effective collapse
state. Group IDs include the mode.

Both `.robos/ontology.jsonld` and `docs/schemas/ontology.jsonld` publish the
classification property, code set, codes, and class/predicate annotations. Run
`node scripts/sync-classification-ontology.js` after catalog changes. Tests audit
all built-in target classes and aliases, shape predicates, canonical property
metadata, dependency/reference registries, and both ontologies. New registry
entries without catalog coverage fail the audit.

```sh
node --test packages/robos-test/tests/sdlc-graph/classification.test.js
docker --context default run --rm --init \
  -v "$PWD:/workspace" robos-kgraph-test:local \
  xvfb-run -a -s '-screen 0 1920x1080x24' \
  node --test packages/robos-test/tests/sdlc-graph/classification.e2e.js
```

The real Electron test covers declared/inferred/unknown nodes, multiple types,
protobuf enum search, collapse/search counts, combined filters, all grouping
alternatives, saved-graph immutability and reopen. It also verifies upstream
`uses`/`calls` object references and that missing dependencies do not imply safety.
Generic proof stays in the ignored `packages/robos-test/run/classification/`
directory: `classification.webm`, captions, screenshots, `result.json`, and
`walkthrough.md`.

## Dependency evidence and impact

Impact traversal uses a dependent-to-prerequisite relation catalog in
`lib/relationships.js`. Both upstream dependencies and downstream dependents
carry the predicate, shortest-hop distance and available edge evidence. Repository
membership, source derivation, ownership and generic references remain searchable
but do not establish dependency impact. Conditional edges identify review
candidates; their conditions must be checked before assuming a transitive path is
active. Recursive data models can legitimately form cycles.

The source importer records npm runtime, development, peer and optional scopes
separately, links uniquely resolved Go modules, and extracts protobuf imports,
RPC input/output types and message-field types (including enum references).
Every extracted link carries a source location. Unavailable external modules,
missing protobuf sources and ambiguous symbols are reported rather than guessed.
This is bounded static extraction, not complete language/compiler analysis;
protobuf public re-exports are followed within available source files, while
arbitrary dynamic code remains outside its current scope. See source coverage before interpreting a missing dependency.

`query --depends-on <id> --depth 1 --graph-root <path> --json` selects modeled
dependents. `impact <id> --depth 3 --graph-root <path> --json` returns both
`dependents` and `dependencies`. The general path finder follows directed
references; its connectivity result is broader than dependency impact.

With an external graph root, Kube Studio, Data Sources and Remote Execution
Studio open searchable declaration views scoped to infrastructure, data and
build execution respectively. Each view exposes source evidence, relationships
and conditions. Legacy demo filters, tables and live-operation controls are
hidden in this mode; these views do not imply deployment or runtime health.

Large imports can be loaded using the JSON/JSON-LD file chooser in Import &
Refine. Preview shows the property-level changes, evidence, validation and
conflicts. The main process retains the complete proposal; Save submits its
reviewed ID, and rejects stale or replaced proposals before writing. Unchanged
source reimports preserve accepted corrections.

The topology view uses the shared relationship resolver for object, array and
legacy string references. Cyan solid arrows identify dependency predicates;
slate dashed arrows identify other references. Neighborhood, package and all-node
scopes prioritize connected nodes and disclose the 48-node/160-link display limits.
Use a narrower scope for detail. Top-to-bottom and left-to-right modes route arrows
around boxes; labels and hover titles expose predicates and endpoints.

## Object inspector

Overview displays recorded properties and graph references without invented
owners, defaults, runtime status or test results. JSON-LD displays the actual
selected node. Documentation and Source Evidence are conditional on recorded
content/references and evidence respectively; source paths are references, not
embedded file contents. Relationship tabs require actual modeled relationships.
Switching to an object that does not support the active tab returns to Overview.

The inspector no longer includes the static GitOps tree, autonomous execution
demo, walkthrough video, local test fabric or global traceability demo. These
were not evidence about the selected object. See [the audit](INSPECTOR.md).
