# Object inspector tab audit

| Previous tab | Finding | Decision |
| --- | --- | --- |
| Visual Inspector & BDD | Type templates invented defaults, pass statuses and launch controls; some JSON-LD object references crashed string handling | Replace with faithful Overview of recorded fields and relationships |
| Topology Graph | Real selected-object relationships; recently fixed shared reference resolution | Keep as Topology when internal relationships exist |
| Blast Radius & Impact | Real dependency traversal, but arbitrary count-based risk labels | Keep as Impact with factual counts and explicit model limits |
| Query & Paths | Working graph query and directed path tools | Keep; scope path origin to the selected object |
| .robos/ GitOps SDLC | Displays static GITOPS_FILES rather than selected-object configuration | Remove from object inspector |
| Autonomous EDD Loop | Unrelated execution/demo workflow | Remove from object inspector |
| Video Walkthrough | Hardcoded form-submission chapters and fabricated verified-video claims | Remove from object inspector |
| Local Test Fabric | Unrelated demo test environment and canned status | Remove from object inspector |
| Traceability Matrix | Global matrix with unconditional 100% VERIFIED and PASS labels | Remove from object inspector |
| RDF Triples (JSON-LD) | Actual JSON-LD, mislabeled as a triples view | Keep as JSON-LD, escape text |
| Documentation (new) | Only recorded content, documentation source references or resolved document links | Show only when selected-object data supports it; deduplicate source paths and link clean recorded GitHub revisions |
| Source Evidence (new) | Actual node/relationship evidence | Show only when matching evidence exists |

No application behavior or live runtime health is inferred from source declarations. Unsupported tabs must also be rejected by programmatic navigation; switching objects falls back to Overview when the previous tab no longer applies.

The Graph Nodes divider is draggable and keyboard accessible (Left/Right, Shift for larger steps, Home/End for limits). Its width is saved locally across reopening; double-click resets it. Narrowing the window constrains the panels without discarding the preferred width.

## Schema property groups

The schema catalog in `lib/inspector-groups.js` assigns contextual property groups
to built-in types and their aliases. Each group requires an applicable type and
at least one populated domain property or recorded child relation. A type, title,
or provenance path alone never creates an empty specialist tab. The catalog test
checks every executable SHACL target and every domain constraint property, so new
schema types cannot silently miss viewer coverage. The [type-by-type coverage audit](../../docs/inspector-schema-coverage.md) lists all 98 shapes, 141 targets/aliases, and 25 groups.

Select an MCP server and open **MCP Server** to browse its recorded actions/tools,
resources and prompts. Child cards show descriptions, declarations, parameter
schemas and registration/availability conditions when recorded. Click an object
name to inspect it, or **Source Evidence** to inspect its provenance. Input and
output schemas follow the [MCP schema reference](https://modelcontextprotocol.io/specification/2025-11-25/schema).
The viewer displays declarations; it does not connect to servers or execute actions.
Missing input schemas or runtime observations are not filled with defaults.

Services expose their contracts, implementations, data and messaging references.
Other groups cover application configuration and routes, data models and database
structure, brokers and consumers, Kubernetes and deployment configuration,
pipeline stages/jobs/steps, Git history, work items, organizations, tests and BDD,
learning, documentation structure, agent skills, and remote builds.

Forward and inverse references are both visible. The same target appears once in
a group, retaining each original predicate and direction. Unresolved explicit
references remain visible as unavailable graph nodes. Large related-object lists
load 40 cards at a time with an explicit **Show more** control. Property labels
are human-readable; hover a label to see its exact schema predicate. All recorded
text is rendered as text, including code and schemas.

Validation: `npm --prefix packages/robos-test run test:inspector` checks catalog and
capability behavior. `npm --prefix packages/robos-test run test:inspector:e2e` runs
the real Electron inspector suites, including recorded type-specific navigation.
