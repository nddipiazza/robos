---
title: Walkthroughs and proof of work
layout: default
parent: "Review & governance"
nav_order: 2
---

# Walkthroughs and proof of work
{: .no_toc }

What RobOS treats as proof that a change works, and which recorded walkthroughs and tests in the repository back that up. Read it to judge how much to trust a recording or an agent's claim, and to regenerate one yourself.
{: .fs-6 }

## Kinds of proof

| Kind | Where it lives | What it is |
|:---|:---|:---|
| Evidence bundle | The Evidence tab of a review; `packages/robos-lib/evidence-*.js` | Output captured by running code at one commit. A new commit marks it stale. |
| Walkthrough checkpoints | The Walkthrough tab of a review | A Codex agent runs the app to each checkpoint and pauses. You decide when to move on. |
| CI checks | The CI banner of a review | Check results read from GitHub, and job logs from Buildkite. |
| Tests | `packages/robos-test/tests/` | Assertions, run with `node --test`. |
| Recorded demos | `packages/robos-test/demos/` | Scripted clicks through an app, recorded to video. Mostly sandbox data. |

The first three are described in [PR Review Theater]({{ site.baseurl }}{% link pr-review-theater.md %}). The rest of this page covers tests and recordings. A recording shows what a script did. Its narration states intent, so treat narrated numbers (test counts, latencies, deployment totals) as fixture data unless the script checks them.

## The review lifecycle recording

The recording on the [RobOS home page](https://rowbose.com/) follows one task from an idea to a merged pull request through the real apps: Task Explorer, Task Implementer and the review window. It lasts about 2 minutes 23 seconds in 11 steps. The script is [`demos/review-lifecycle-hero-demo.js`](https://github.com/nddipiazza/robos/blob/main/packages/robos-test/demos/review-lifecycle-hero-demo.js), and the supporting code is in `packages/robos-test/lib/lifecycle/`.

The sample repository, its tests, the evidence and every screen are real. The forge, the agents and the CI results are scripted stand-ins, so the run is repeatable.

| Step | App | Real | Stand-in |
|:---|:---|:---|:---|
| 1 Task created | Task Explorer | The UI and issue creation flow | `gh` (a stateful forge), the AI that drafts the tasks |
| 2 Task implemented | Task Implementer | The UI, the branch, commit, push and test run | The `claude` agent's narration |
| 3 to 6 Changes, evidence, walkthrough, draft PR | Review window | The diff, the before and after evidence, the PR creation flow | `gh`, the `codex` agent's narration (it runs real commands) |
| 7 and 8 CI, ready | Review window | The CI banner and the ready dialog | CI results, set by the script |
| 9 Reviewer approves | Review window, reviewer mode | The UI and the approve flow | `gh` |
| 10 Owner merges | Review window | The merged state | The merge, run with `gh pr merge` against the stand-in forge |
| 11 Post-merge CI | Review window, Task Explorer | The failing-CI banner and the follow-up task flow | The CI result, the AI that drafts the follow-up |

A test covers the building blocks. It passes in a few seconds and needs only Node.js and `git`:

```bash
node --test packages/robos-test/tests/lifecycle/lifecycle.test.js
```

It checks six things: the feature commit passes the sample project's own tests; removing comments is a real, scoped commit; switching to species chips changes only the page; an evidence bundle is valid for `HEAD` and goes stale after a new commit; the stand-in forge walks a PR from draft to merged and enforces the rules (an author cannot approve their own PR, and a draft cannot merge); and the recording composer splits captions and slides correctly.

To record it yourself you need `xvfb`, `ffmpeg`, and Electron installed in `packages/robos-test/node_modules` (run `npm install` there):

```bash
xvfb-run -a -s "-screen 0 1920x1080x24" node packages/robos-test/demos/review-lifecycle-hero-demo.js /tmp/hero
node packages/robos-test/lib/lifecycle/compose.js /tmp/hero /tmp/hero/out
```

`compose.js` cuts dead time, adds captions and encodes MP4, WebM, a poster and a storyboard GIF. A third script, `publish-hero.js`, copies the result into the front site's `assets/hero/` folder and writes `_data/hero.json`; skip it unless you maintain that site. The steps and their environment variables (`HERO_SPEED`, `CHROME_BIN`) are in `packages/robos-test/lib/lifecycle/README.md`.

## How the demo recorder works

Every file in `packages/robos-test/demos/` that calls `runDemo` from `lib/demo-runner.js` follows the same pattern. The script lists cues, each with narration text, an optional element to click or type into, a callout and a minimum hold time. The runner then:

1. Launches the app through `lib/harness.js` in a sandbox, using a scenario from `lib/scenarios.js` and stub binaries from `packages/robos-test/sandbox/bin` (`gh`, `git`, `gpg`, `pass`, `ssh`, `ssh-keygen`, `claude`).
2. Injects a pointer, callout bubbles and a subtitle banner into the window.
3. Records the window with `ffmpeg` (`x11grab`) and writes `<slug>.webm`, `<slug>.vtt` and `<slug>-final.webm` to `packages/robos-test/run/demos/<slug>/`.
4. Copies the result to `~/.robos/development/walkthroughs/<slug>/`, with a `walkthrough.md` summary and a timestamped copy under `history/`.

Narration audio is off by default (`audio: false`). When a demo turns it on, the runner synthesizes each cue with Piper using a voice model from `packages/robos-test/models/`, which is not in the repository, and falls back to `espeak-ng` or `espeak`.

Run a demo on a machine with `xvfb`, `ffmpeg` and Electron, or in the Docker test container:

```bash
xvfb-run -a -s "-screen 0 1920x1080x24" node packages/robos-test/demos/new-app-wizard-demo.js
./scripts/e2e-container.sh node packages/robos-test/demos/new-app-wizard-demo.js
```

### Limits

- The scenarios and stub binaries fake accounts, keys and the forge. Steps 9 and 10 below are the exception: they use a real local Kind cluster (set up with `scripts/setup-local-kube.sh`).
- Many scripts contain checks that throw `E2E Assertion Failed` inside the page. The recorder ignores errors thrown there, so a failed check does not fail the run. Only Steps 9 and 10 check results from Node (`kubectl get pods`) and exit with an error.
- 41 of the 128 scripts contain hard-coded paths under `/home/ndipiazza/`. Many of those write frames or videos to such a directory, so edit constants like `BRAIN_DIR` before running them elsewhere.
- Few finished recordings are committed. Generate your own with the commands above.
- `acme-petshop-step6-pr-ci-demo.js` and `agent-code-review-ide-demo.js` click through a pull request list (`.pr-card`) that the review app no longer shows at startup, so they are not listed below.
- The five entry points in `demos/RETIRED.md` exit with status 1 on purpose. Do not run them.

## Demo catalog

Every script below is in `packages/robos-test/demos/`, and each app name is a folder under `packages/`. Unless a row says "Backed by" a test or "Fails", the script only records.

### Acme Petshop sequence

A reference project that a sequence of demos builds up, from planning to deployment. Scripts are named `acme-petshop-stepN-...-demo.js`.

![Eleven phases of an application lifecycle in two rows, from organization setup through scaffolding, planning, contracts, implementation, review, databases, API checks and Kubernetes to runtime operations]({{ '/assets/images/app-flow-lifecycle-overview.jpg' | relative_url }}){: .robos-zoomable-img loading="lazy" }
*Concept diagram from the original design docs. The text on this page says what is built today.*

| Script | App | What it does |
|:---|:---|:---|
| 1 `step1-tasks` | `task-planner` | Creates the "Acme Petshop Platform" project, enters an architecture prompt, answers two planning questions, saves the plan and syncs six issues to a local Gitea server. |
| 2 `step2-topology` | `topology-manager` | Generates six container nodes from a prompt, inspects two of them, opens the C4 level 1 view and exports the C4 PlantUML. |
| 3 `step3-contracts` | `contract-studio` | Opens the OpenAPI and AsyncAPI contracts, then runs the lint, Pact and mock-server actions. |
| 4 `step4-git-projects` | `git-projects` | Generates the repository list from a prompt and inspects one repository's local dev setup and secrets tabs. |
| 5 `step5-ide-execution` | `intellij-idea` | Launches a task workspace, stops at a breakpoint, shows variables and an AI plan, then resumes. |
| 7 `step7-deploy-tracker` | `deploy-tracker` | Filters the deployment timeline by staging and production and lists releases mapped to a PR and ticket. |
| 8 `step8-kube-studio` | `kube-studio` | Tours pods, logs, Helm releases and the ArgoCD tab on fixture data. |
| 9 `step9-real-kube-e2e` | `kube-studio` | Deploys `petstore-api` to a local Kind cluster from the app. Fails unless `kubectl get pods` lists a `petstore-api` pod. |
| 10 `step10-continuous-deploy` | `kube-studio` | Implements a task, approves a PR and watches the deployment appear. Fails unless `kubectl get pods` lists a `vaccine-gateway` pod. |
| 11 `step11-bruno-rest-client` | `rest-client` | Generates a `.bru` request from a TypeSpec schema, saves it into the repository and sends it. |
| 12 `step12-collection-runner` | `rest-client` | Runs a five-request collection, publishes the result as a PR gate and exports a report. |
| 13 `step13-agy-mcp-task` | `agents-manager` | Opens the Antigravity provider page: router status, launch flags and saved sessions. |
| `developer-tools-suite` | `db-manager` | Shows the data viewer, SQL console and DDL tab, then the NoSQL, gRPC and GraphQL clients. |
| `topology-db-kube-lifecycle` | `topology-manager` | Adds a PostgreSQL data source to the topology and exports the C4 container diagram. |

![Four stacked views of the C4 model: system context, containers, components and code]({{ '/assets/images/c4-model-architecture.jpg' | relative_url }}){: .robos-zoomable-img loading="lazy" }
*Concept diagram from the original design docs, explaining the C4 levels that step 2 and `topology-db-kube-lifecycle` use. The text on this page says what is built today.*

![Task Planner with a prompt for the Acme Petshop platform, six generated tasks and a Save to Project button]({{ '/assets/images/screenshots/acme-petshop-step1-synced_frame.png' | relative_url }}){: .robos-zoomable-img loading="lazy" }
*Step 1: the planning prompt and the generated epic and tasks, before they are synced to the local Gitea server.*

![Topology manager at C4 level 2 with six container nodes and a node inspector on the right]({{ '/assets/images/screenshots/acme-petshop-step2-canvas_frame.png' | relative_url }}){: .robos-zoomable-img loading="lazy" }
*Step 2: the six container nodes on the topology canvas, with the inspector for `petstore-api`.*

![Contract Studio with the contract registry and a running Prism mock server on port 4010]({{ '/assets/images/screenshots/acme-petshop-step3-prism_mock_frame.png' | relative_url }}){: .robos-zoomable-img loading="lazy" }
*Step 3: the contract registry on the left and the mock server status in the operations pane.*

![Git Projects with a repository tree for the acme-org organization and no project selected]({{ '/assets/images/screenshots/acme-petshop-step4-projects_open_frame.png' | relative_url }}){: .robos-zoomable-img loading="lazy" }
*Step 4: the repository tree with the six `acme-org` repositories.*

![A Java file stopped at a breakpoint with a debug pane below and an AI plan review panel on the right]({{ '/assets/images/screenshots/acme-petshop-step5-breakpoint_frame.png' | relative_url }}){: .robos-zoomable-img loading="lazy" }
*Step 5: execution stopped at the breakpoint, with the plan the AI proposes on the right.*

![Deploy Tracker filtered to production, showing one deployment, three releases and one merged changeset]({{ '/assets/images/screenshots/acme-petshop-step7-timeline_frame.png' | relative_url }}){: .robos-zoomable-img loading="lazy" }
*Step 7: the production filter on the deployment timeline. The data is fixture data.*

![Kube Studio pods table with six running pods in the acme-petshop-prod namespace]({{ '/assets/images/screenshots/acme-petshop-step8-pods_table_frame.png' | relative_url }}){: .robos-zoomable-img loading="lazy" }
*Step 8: the pods table. This tour runs on fixture data, not a live cluster.*

![Kube Studio on a local Kind cluster listing deployable applications, with Deploy pressed on Petstore API Service]({{ '/assets/images/screenshots/acme-petshop-step9-live_pods_frame.png' | relative_url }}){: .robos-zoomable-img loading="lazy" }
*Step 9: the Deploy button for `petstore-api`, which runs against the local Kind cluster.*

![REST Client showing the generated Bruno source for a request that verifies a vaccine certificate]({{ '/assets/images/screenshots/acme-petshop-step11-live_response_frame.png' | relative_url }}){: .robos-zoomable-img loading="lazy" }
*Step 11: the Bruno Source tab with the plain-text `.bru` file the demo generated.*

![REST Client collection runner with five passing requests in a test execution matrix]({{ '/assets/images/screenshots/acme-petshop-step12-results_matrix_frame.png' | relative_url }}){: .robos-zoomable-img loading="lazy" }
*Step 12: the five-request run and the Publish Gate button.*

![Agents Manager with the Antigravity and Gemini CLI provider selected, showing router status and one saved session]({{ '/assets/images/screenshots/acme-petshop-step13-agy_provider_frame.png' | relative_url }}){: .robos-zoomable-img loading="lazy" }
*Step 13: the provider page with router status, launch buttons and the saved sessions list.*

![Relational DB Manager with an SQL console query and its result grid of five pets]({{ '/assets/images/screenshots/dev-tools-sql_console_query_frame.png' | relative_url }}){: .robos-zoomable-img loading="lazy" }
*`developer-tools-suite`: the SQL console with a query and its result grid.*

![Topology manager with an Add Data Source button next to the C4 level 2 container view]({{ '/assets/images/screenshots/topology-db-c4_polyglot_frame.png' | relative_url }}){: .robos-zoomable-img loading="lazy" }
*`topology-db-kube-lifecycle`: the C4 container view, with the Add Data Source button in the header.*

### Company and app setup

| Script | App | What it does |
|:---|:---|:---|
| `existing-company-setup-demo.js` | `group-manager` | Links a developer identity through the directory sync dialog and opens the synchronized team. |
| `new-company-setup-demo.js` | `group-manager` | Bootstraps a new company with a root administrator and shows the resulting teams. |
| `new-app-wizard-demo.js` | `app-wizard` | Walks the wizard from the Microservice archetype through name, contract and scaffold. |
| `app-import-wizard-demo.js` | `app-wizard` | Switches the wizard to Import mode, inspects a codebase and completes ingestion. |

![A flowchart that branches by organization type into directory sync or one-click company bootstrap, then maps teams, sets up security and ends at a ready developer foundation]({{ '/assets/images/app-flow-org-foundation.jpg' | relative_url }}){: .robos-zoomable-img loading="lazy" }
*Concept diagram from the original design docs. The text on this page says what is built today.*

![Group Manager showing the Enterprise Directory Sync and Identity Setup form with five status lines below the fields]({{ '/assets/images/screenshots/existing-company-teams-mapped_frame.png' | relative_url }}){: .robos-zoomable-img loading="lazy" }
*`existing-company-setup-demo.js`: the directory sync dialog after the developer identity is linked.*

![Group Manager after Bootstrap, showing the Founding Core Engineering group with its seven sections and a second group in the sidebar]({{ '/assets/images/screenshots/new-company-security-baseline_frame.png' | relative_url }}){: .robos-zoomable-img loading="lazy" }
*`new-company-setup-demo.js`: the new company's groups after the bootstrap step.*

![App Wizard on the first step with nine archetype cards, Microservice selected]({{ '/assets/images/screenshots/new-app-archetypes_frame.png' | relative_url }}){: .robos-zoomable-img loading="lazy" }
*`new-app-wizard-demo.js`: the archetype step, where the Microservice card is the starting point.*

![The inspection step showing graph entity counts, package pills and the detected archetype of a local folder]({{ '/assets/images/screenshots/import-app-deep-inspection_frame.png' | relative_url }}){: .robos-zoomable-img loading="lazy" }
*`app-import-wizard-demo.js`: the inspection result for a local codebase.*

### Knowledge Graph

| Script | What it does |
|:---|:---|
| `robos-graph-demo.js`, `graph-diff-demo.js` | The graph explorer's overview, and a branch comparison. |
| `multi-package-repo-demo.js` | The Packages and Repositories dialog: the standard packages, an external repository pinned to a git tag, and the namespace filter. Backed by `tests/sdlc-graph/multi-package-repo.test.js`. |
| `devops-integrations-demo.js` | The DevOps account integrations wizard. Backed by `tests/sdlc-graph/devops-integrations.test.js`, which checks the provider catalog and that secrets go into `pass` with no plaintext in the graph. |
| `kgraph-resource-importer-demo.js` | Calls `importFromPrompt` on a local monorepo fixture and captures the ingested overview, a flow diagram, an architecture decision record, GitHub organization rules, an OpenAPI service and a GitLab pipeline. |

![The Packages and Repositories dialog listing six standard packages with node counts and a registered local repository]({{ '/assets/images/screenshots/multi-pkg-modal_frame.png' | relative_url }}){: .robos-zoomable-img loading="lazy" }
*`multi-package-repo-demo.js`: the standard packages and the registered repository list.*

![The DevOps Account Integrations wizard with category filters and provider cards for GitHub, GitLab, Bitbucket and Gitea]({{ '/assets/images/screenshots/devops-wizard-categories_frame.png' | relative_url }}){: .robos-zoomable-img loading="lazy" }
*`devops-integrations-demo.js`: step 1 of the wizard, choosing a category and provider.*

### Agent runtime and tools

| Script | App | What it does |
|:---|:---|:---|
| `robos-profiled-demo.js` and the `-tmpfs`, `-zero-residue` and `-display` variants | `robos-profiled` | Provisions an ephemeral agent profile in the manager UI, inspects it and terminates it. |
| `robos-agentd-demo.js` | `robos-agentd` | Starts a sub-agent session for a task with a persona and ends it. |
| `desktop-agents-demo.js` | `desktop-agents` | Browses a grid of sub-agent desktops and focuses one stream. |
| `mcp-manager-demo.js`, `mcp-router-demo.js` | `mcp-manager`, `robos-mcp-router` | Lists MCP servers and sets access permissions saved to `~/.config/robos/mcp-config.json`, and sends a tool call through the unified router endpoint. |
| `agent-tiers-preferences-demo.js` | `robos-preferences` | Opens Agent Tiers and Prompt Optimization, changes the compression and DSPy settings, saves and captures three frames. See [Agent tiers]({{ site.baseurl }}{% link agent-tiers.md %}) for what those settings do today. |

![The Ephemeral Profile Daemon manager with zero active profiles and a Provision Agent Profile button]({{ '/assets/images/screenshots/robos-profiled-frame_01.png' | relative_url }}){: .robos-zoomable-img loading="lazy" }
*`robos-profiled-demo.js`: the profile manager before a profile is provisioned.*

![RobOS Preferences showing the Agent Tiers and Prompt Optimization section with default values]({{ '/assets/images/screenshots/agent-tiers-preferences-overview.png' | relative_url }}){: .robos-zoomable-img loading="lazy" }
*`agent-tiers-preferences-demo.js`: the Agent Tiers section with its default values.*

### Other apps

| Script | App | What it does |
|:---|:---|:---|
| `data-sources-demo.js` | `data-sources` | A PostgreSQL source with its schema inspector and a query, an S3 bucket listing, and the new-source wizard. |
| `schema-studio-demo.js` | `schema-studio` | The TypeSpec and Protobuf models, code generation and a breaking-change check. |
| `people-manager-demo.js` | `people-manager` | The roster of people and agent personas. |
| `remote-execution-studio-demo.js` | `remote-execution-studio` | Cluster overview, an endpoint health probe, Bazel and Buck2 client settings, Buildbarn provider settings and the knowledge graph tab. It saves six screenshots into `docs/assets/images/screenshots/`. Backed by `tests/remote-execution/smoke.test.js`. |

![Data Sources showing an Acme Petshop PostgreSQL source with a schema inspector listing the pets table columns]({{ '/assets/images/screenshots/data-sources-postgres_overview_frame.png' | relative_url }}){: .robos-zoomable-img loading="lazy" }
*`data-sources-demo.js`: the PostgreSQL source with the schema inspector open on the pets table.*

![Entity Schema Studio with a TypeSpec model on top and compiled TypeScript, Java, Python, Go and Prisma targets below]({{ '/assets/images/screenshots/schema-studio-frame_01.png' | relative_url }}){: .robos-zoomable-img loading="lazy" }
*`schema-studio-demo.js`: a TypeSpec model and the language tabs it compiles to.*

![Remote Execution Studio cluster overview with the endpoints, worker pools and cache settings of a Buildbarn cluster]({{ '/assets/images/screenshots/re-studio-overview_frame.png' | relative_url }}){: .robos-zoomable-img loading="lazy" }
*`remote-execution-studio-demo.js`: the Cluster Overview tab, one of the six saved screenshots.*
