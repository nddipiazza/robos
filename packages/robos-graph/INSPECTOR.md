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
