---
title: What sets RobOS apart
layout: default
parent: RobOS for Teams
nav_order: 2
permalink: /big-wins.html
redirect_from:
  - /four-pillars.html
  - /demo.html
  - /demo
  - /demo/
  - /wins
  - /wins.html
  - /20-wins
  - /20-wins.html
  - /21-wins
  - /21-wins.html
  - /big-wins/agent-agnostic-framework.html
  - /big-wins/agent-app-interaction.html
  - /big-wins/ai-enhanced-devtools-ide.html
  - /big-wins/api-and-web-clients.html
  - /big-wins/data-sources-management.html
  - /big-wins/declarative-gitops-synthesis.html
  - /big-wins/dev-discussions.html
  - /big-wins/devops-security-pass.html
  - /big-wins/dual-state-knowledge-graph.html
  - /big-wins/ephemeral-agent-sandboxes.html
  - /big-wins/interactive-task-planning.html
  - /big-wins/kgraph-first-app-generation.html
  - /big-wins/modular-kgraph-packages.html
  - /big-wins/remote-execution-studio.html
  - /big-wins/video-proof-of-work.html
---

# What sets RobOS apart
{: .no_toc }

The parts of RobOS that go beyond running a coding agent in a terminal, described as they exist in the source today, including what is partial or not built.
{: .fs-6 }

<details open markdown="block">
  <summary>On this page</summary>
  {: .text-delta }
1. TOC
{:toc}
</details>

Each section names the package that implements the feature. Where a feature falls short of what you might expect, the section says so. Planned work is on the [Roadmap]({{ site.baseurl }}{% link roadmap.md %}).

## Recorded proof of work

`packages/robos-test` can record a scripted run of a RobOS app as video. A demo script lists steps, and each step has a CSS selector, an action and a line of narration. The runner launches the app, records its window with `ffmpeg` (`x11grab`, 30 fps, scaled to 1920x1080, VP9 in a `.webm` file), writes a WebVTT caption file from the narration, and shows the narration as on-screen text. Set `audio: true` in the demo config to add a Piper text-to-speech voice (it falls back to `espeak-ng`, `espeak`, or silence if Piper is missing).

![Flowchart from a task goal through headless DOM assertions and narrated recording to a short human review]({{ '/assets/images/pillar3-video-proof-of-work.jpg' | relative_url }}){: .robos-zoomable-img loading="lazy" }
*Concept diagram from the original design docs. The text on this page says what is built today, including that the demo script is written by a person or an agent.*

Run a demo inside the Docker test container, which starts Xvfb on `:99` at 1920x1080 and needs Docker on the host:

```bash
./scripts/e2e-container.sh node packages/robos-test/demos/notifications-demo.js
```

Each run is copied to `~/.robos/development/walkthroughs/<slug>/` as `<slug>-final.webm`, `<slug>.vtt` and a `walkthrough.md` step table, with timestamped copies under `history/`. The `record-demo` skill (`plugins/robos/skills/record-demo`) tells an agent how to write these scripts.

![Four-stage proof-of-work pipeline from layered assertions through video capture and narration to packaging and review]({{ '/assets/images/video-proof-of-work-pipeline.jpg' | relative_url }}){: .robos-zoomable-img loading="lazy" }
*Concept diagram from the original design docs. Recording and narration exist in `packages/robos-test`; a Dev Central player and automatic video from any test run do not, so the text on this page is the guide.*

In PR Review, the evidence runner (`packages/robos-lib/evidence-runner.js`) rejects an agent result that marks a scenario as passed without a captured artifact inside the run folder. Not built yet: producing a narrated video automatically from an arbitrary test run. The demo script is written by a person or an agent. See [Walkthroughs and proof of work]({{ site.baseurl }}{% link walkthroughs.md %}).

## Review gates in PR Review Theater

The [PR Review app]({{ '/apps/pr-review/' | relative_url }}) shows a review as a sequence of steps: Description, Overview, Documentation, Changes, Open in IDE, Evidence, Walkthrough and Approve. Local reviews that have no pull request yet also get a Pull Request step. For pull requests with knowledge graph context, the default team configuration adds a reviewer knowledge check in the Overview step, with a pass score of 80, that locks the diffs and sign-off until it is passed, and it marks the evidence step as required. The Walkthrough step has an agent demonstrate the change in a real browser one checkpoint at a time, and it can run the same checkpoints against a separate checkout of the base revision.

![PR Review app showing a pull request overview with status cards and buttons for PR Review Theater, IntelliJ and VS Code]({{ '/assets/images/screenshots/pr-review-theater-02-pr-detail.png' | relative_url }}){: .robos-zoomable-img loading="lazy" }
*Look at the Overview tab and the buttons at the top right that start the staged review or open the pull request in an IDE.*

These gates live in the app. They are not GitHub branch protection rules. Local reviews, which have no pull request yet, turn the knowledge check off. Details are on [PR Review Theater]({{ site.baseurl }}{% link pr-review-theater.md %}).

The Open in IDE step has a VS Code path and an IntelliJ path. For VS Code, the app opens a `vscode://github.vscode-pull-request-github/open-pr?number=<n>&repo=<repo>` link, which needs the GitHub Pull Requests and Issues extension, and runs `code --goto`. For IntelliJ, the Kotlin plugin in `plugins/intellij-idea` runs a local server on port 63343 with endpoints to open a file, set a breakpoint, manage run configurations and read thread state. The app posts to `/api/robos/pull-request/open`, which that plugin does not serve, so in practice it falls back to `idea --line <n> <file>`. The step list the app prints afterwards (checking out the branch, activating the Pull Request tool window) is fixed text, not a report of what the IDE did.

```mermaid
flowchart LR
    subgraph AgentSpace["RobOS agent runtime"]
        Agent["Agent<br/>(Codex, Claude, Antigravity)"]
        Harness["Agent harness<br/>(packages/robos-agent-client)"]
        MCPClient["IDE Bridge MCP server<br/>(packages/ide-bridge-mcp)"]
    end
    subgraph Bridge["Bridge state"]
        StateDB["State file<br/>(~/.config/robos/ide/state.json)"]
        PassRef["pass: references<br/>in run configurations"]
    end
    PRApp["PR Review app"]
    IDEA["IntelliJ IDEA<br/>(RobOS plugin, port 63343)"]
    VSCode["Visual Studio Code"]
    Agent --> Harness --> MCPClient
    MCPClient <-->|"HTTP on port 63343"| IDEA
    MCPClient <--> StateDB
    PassRef --> MCPClient
    PRApp -->|"vscode:// link and code --goto"| VSCode
    PRApp -->|"idea --line"| IDEA
```

*Concept diagram from the original design docs, corrected to the current code. The PR Review app reaches the IDEs through a link or command line, and only some plugin routes are implemented, as described above.*

![IDE Bridge MCP console on the left showing open files, run configurations and a protocol trace, beside a simulated IntelliJ window paused at a breakpoint]({{ '/assets/images/screenshots/ide-bridge-side-by-side-frame.png' | relative_url }}){: .robos-zoomable-img loading="lazy" }
*Look at the bridge console on the left and the IntelliJ window on the right. The right side is the IntelliJ IDEA Bridge test app, which answers the plugin routes with in-memory data.*

![Simulated IntelliJ window paused on a breakpoint with frames and variables]({{ '/assets/images/screenshots/intellij-idea-frame.png' | relative_url }}){: .robos-zoomable-img loading="lazy" }
*Look at the breakpoint on line 6 and the frames and variables pane. This is the same simulated window at full size.*

## Knowledge graph diff and blast radius

`packages/robos-graph` keeps a JSON-LD knowledge graph as packages under `.robos/kgraphs/<package>/package.jsonld`, catalogued by `.robos/kgraph.yaml`, and validates nodes against SHACL shapes. In the graph app, the **Blast Radius** button on a node lists what depends on it. The CLI does the same, and it can diff two graph documents:

```bash
node packages/robos-graph/bin/kgraph-cli.js impact "urn:robos:service:auth-service" --depth 2
node packages/robos-graph/bin/kgraph-cli.js diff feature/TASK-101-auth --base main --json
```

`diff` reports added, removed and modified nodes, a risk level (high when a contract or microservice is removed), and the services, contracts, requirements and teams within three dependency hops of the changes.

![Recorded walkthrough of the graph explorer showing a topology, a validation check, a graph diff between two states and a blast radius]({{ '/assets/images/big-win-dual-state-kgraph.gif' | relative_url }}){: .robos-zoomable-img loading="lazy" }
*Recorded walkthrough of the Knowledge Graph Explorer. Look at the comparison of two graph states and the list of nodes that depend on the changed ones.*

The "dual state" is only partly built. The branches that the graph app and `kgraph diff` compare are in-memory copies of the loaded graph plus a few built-in sample branches. They are not read from your Git branches, so a diff does not yet reflect a real feature branch. The plain-text output of `kgraph diff` also prints zero counts, so use `--json`. Schema drift detection is not implemented.

![Production main and a proposed feature branch shown as two knowledge graph states with a blast radius flagged between them]({{ '/assets/images/pillar1-dual-state-architecture.jpg' | relative_url }}){: .robos-zoomable-img loading="lazy" }
*Concept diagram from the original design docs. It shows live production state compared with proposed changes. Today the compared states are in-memory copies and schema drift detection is not implemented; the text on this page says what is built.*

![Dual-state knowledge graph comparing production main with a proposed feature branch to flag breaking downstream impacts]({{ '/assets/images/dual-state-blast-radius.jpg' | relative_url }}){: .robos-zoomable-img loading="lazy" }
*Concept diagram from the original design docs. Same idea as above: the branches the graph app compares today are in-memory copies, not your Git branches.*

Two parts are solid. Imports into an external graph workspace (`ROBOS_GRAPH_ROOT`) go through `kgraph propose` and `kgraph apply`, with hash-checked proposals, three-way conflict detection, a write lock and `kgraph recover` for interrupted writes. External knowledge graph repositories can be pinned by Git tag and are cloned shallowly into `~/.robos/cache/kgraphs/<repo>@<tag>/`, but if the clone fails the code creates a stub package with a placeholder node instead of reporting an error. See [Knowledge graph]({{ site.baseurl }}{% link knowledge-graph.md %}) and the [robos-graph app page]({{ '/apps/robos-graph/' | relative_url }}).

![Local workspace repositories linked with external Git-tagged knowledge graph packages and evaluated as one graph]({{ '/assets/images/multi-repo-kgraph-composition.jpg' | relative_url }}){: .robos-zoomable-img loading="lazy" }
*Concept diagram from the original design docs. The text on this page says what is built today, including the stub package created when a clone fails.*

![Knowledge graph packages dialog listing namespaced packages with node counts and a form to register an external repository with a Git tag]({{ '/assets/images/screenshots/multi-pkg-modal_frame.png' | relative_url }}){: .robos-zoomable-img loading="lazy" }
*Look at the package cards, such as services and organization, and the Register External repository form with its Git tag field at the bottom.*

## Sandboxes for agent runs

`packages/robos-profiled` is a daemon plus two commands. Start the `robos-profiled` app first, because the commands talk to it over `~/.config/robos/profiled/profiled.sock`. Then `robos-run-as --agent <name> [--autoclean] <command>` creates a profile named `my-agent-<name>` and runs the command with `HOME` pointing at a private folder. When the daemon runs as root, that folder is a 2 GB `tmpfs` mount with mode 0700. Otherwise it is an ordinary folder under `~/.config/robos/profiled/homes/`. `--autoclean`, or `robos-profile terminate <name>`, unmounts and deletes it.

![Agent sandbox lifecycle: a task is dispatched to a temporary RAM-backed profile that is wiped on teardown]({{ '/assets/images/pillar2-ephemeral-sandboxes.jpg' | relative_url }}){: .robos-zoomable-img loading="lazy" }
*Concept diagram from the original design docs. It shows a private virtual display and an instant wipe; the text on this page says what is built, and it is not a security boundary.*

This keeps stray files out of your home folder. It is not a security boundary:

- No Linux user is created. The command runs as the user who started the daemon, and the `uid` in a profile record is only a stored number.
- No cgroup or memory limit is applied, although profiles record a memory value and a scope name.
- The profile uses the host display, with a copy of your X authority file, not a private display.
- It forwards your SSH agent socket, GPG agent socket and `.gitconfig`, and writes `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GEMINI_API_KEY` and `GITHUB_TOKEN` into the profile's `.bashrc`. If a variable is unset, a placeholder value is written.

![Architecture of an ephemeral agent sandbox with a RAM-backed home, a virtual display and credential isolation]({{ '/assets/images/ephemeral-sandboxes-architecture.jpg' | relative_url }}){: .robos-zoomable-img loading="lazy" }
*Concept diagram from the original design docs. It shows a private virtual display and a protected credential tunnel, which are not built; the list above says what a profile does today.*

For stronger isolation, run agents and tests in the Docker container (`./scripts/e2e-container.sh`, built from `infra/docker`). It mounts the repository at `/workspace` read-write and discards everything else when the container exits. See the [robos-profiled app page]({{ '/apps/robos-profiled/' | relative_url }}).

## Prompt security

`packages/robos-lib/prompt-security.js` scans the prompt text before it reaches an agent. It uses a built-in regular-expression catalog: cloud and Git tokens (AWS, GitHub, GitLab, Slack, Stripe, Anthropic, OpenAI, Google), private key blocks, passwords inside database and basic-auth URLs, JWTs, US Social Security numbers, card numbers that pass a Luhn check, emails, phone numbers, private IP addresses, and phrases typical of prompt injection and jailbreaks. A Shannon entropy check (default threshold 4.5 bits per character) catches secrets without a known prefix. The rules are modeled on Gitleaks, TruffleHog, Presidio and OWASP LLM01. Those tools are not run.

Set the mode under **Prompt Security & Guardrails** in the Preferences app: `redact` (default), `block`, `warn`, `audit-only` or `off`. It is stored as `prompt_security_mode` in `~/.config/robos/settings.json`. When a scan finds something, an entry with the finding types and counts, not the secret, is appended to `~/.config/robos/prompt-security-audit.json`, which keeps the last 200 entries.

The scan runs in `AgentSession.start()`, in the embedded router's `runTask()`, in the `ai-prompt` and `agent-chat` apps, and in the `<robos-ai-textarea>` component. It checks the prompt you send. It does not check files an agent reads later or the output of its tools.

## Agent-agnostic harness

`packages/robos-agent-client` puts several agent CLIs behind one interface. `AgentSession` runs a prompt through a backend: Claude Code (`claude`), GitHub Copilot CLI (`gh`), or the HarnessRouter backend. The task runner in `work-task/backend.js` calls `codex exec` or `claude -p`, and `providers.js` lists Codex and Antigravity (`agy`) with their model catalogs, reading each CLI's stored login. `harness-router.js` implements a client for the Unified Harness Protocol (UHP, spec version `2026-08-11`, default server `http://127.0.0.1:3000`) and an embedded in-process router. The embedded router lists Claude Code, Codex, Copilot CLI, Gemini CLI or Antigravity, Hermes and Oh My Pi, and reports whether each command is installed.

![Open standards foundation feeding a dispatcher that routes work to several agent CLIs]({{ '/assets/images/agent-agnostic-standards.jpg' | relative_url }}){: .robos-zoomable-img loading="lazy" }
*Concept diagram from the original design docs. The text on this page says which agent CLIs the router really starts.*

Limit: the embedded router only starts Claude Code, Codex and Copilot. For the other harnesses, or when the chosen CLI is missing, `runTask()` returns a placeholder success message instead of an error. Do not treat a Gemini or Hermes result from the embedded router as real output. How work is assigned to agent tiers is on [Agent tiers]({{ site.baseurl }}{% link agent-tiers.md %}).

![Matrix matching task reasoning complexity against model cost across three tiers]({{ '/assets/images/model-cost-matrix.jpg' | relative_url }}){: .robos-zoomable-img loading="lazy" }
*Concept diagram from the original design docs. The tier fields in Preferences are stored and nothing reads them yet.*

![Seven-phase dispatch flowchart with complexity scoring, sandboxed execution, verification gates and escalation to a higher tier]({{ '/assets/images/agent-tier-dispatch-algorithm.jpg' | relative_url }}){: .robos-zoomable-img loading="lazy" }
*Concept diagram from the original design docs. Automatic tier dispatch is not built; Agent tiers explains what is.*

## Generating apps from the knowledge graph

The [App Wizard]({{ '/apps/app-wizard/' | relative_url }}) (`packages/app-wizard`) is where "knowledge graph first" exists today, in a narrow form. For a new app, `generateNewApp()` writes files for the chosen archetype, then registers a node in the `applications` or `services` graph package, adds an entry to `.robos/packages.yaml`, writes `catalog-info.yaml` and `dev-setup.sh`, and adds the folder to `~/.config/robos/git-projects.json`. Front-end apps get a Next.js template for Vercel with end-to-end test and evidence scripts. Desktop apps get an Electron skeleton, console apps a Node CLI skeleton, and microservices a plain Node HTTP server with an `openapi.yaml` stub and a Dockerfile.

![The knowledge graph as a blueprint compiled into scaffolding, typed models, controllers and migrations under an agent review layer]({{ '/assets/images/kgraph-autogen-architecture.jpg' | relative_url }}){: .robos-zoomable-img loading="lazy" }
*Concept diagram from the original design docs. The text on this page says what is built today.*

The flow runs from wizard to files to graph, not from graph to code. TypeSpec models, API controllers, database migrations, devcontainers and consumer contract tests are not generated. The PC game, mobile app, data pipeline and library archetypes are offered in the wizard, but they receive the same Node server skeleton as microservices and no graph node. The wizard can also import existing code. See [New app wizard]({{ site.baseurl }}{% link new-app-wizard.md %}) and [Building apps]({{ site.baseurl }}{% link app-development-flow.md %}).

![Synthesis pipeline from a graph blueprint through scaffolding, typed models and controllers to verification and human governance]({{ '/assets/images/kgraph-synthesis-pipeline.jpg' | relative_url }}){: .robos-zoomable-img loading="lazy" }
*Concept diagram from the original design docs. Typed models, controllers and migrations are not generated today; the paragraph above lists what is.*

![Greenfield and brownfield paths: scaffold a new service or catalog an existing codebase]({{ '/assets/images/app-flow-scaffolding-ingestion.jpg' | relative_url }}){: .robos-zoomable-img loading="lazy" }
*Concept diagram from the original design docs. The wizard can scaffold new apps and import existing code; the text on this page says what each path writes.*

## Remote Execution Studio

`packages/remote-execution-studio` stores descriptions of Remote Execution API (REAPI v2) clusters, Buildbarn or NativeLink, and of Bazel or Buck2 build systems, and generates configuration text from them: `.bazelrc` with `build:remote` and `build:cache` profiles, `.buckconfig`, Buildbarn component configs (`bb-storage`, `bb-scheduler`, `bb-worker`, `bb-runner`, `bb-browser`) and a NativeLink config. Definitions are saved to `~/.config/robos/remote-execution.json` and as `robos:RemoteExecutionCluster` nodes in the `devops` graph package.

![Remote Execution Studio architecture showing Bazel and Buck2 clients, REAPI v2 and Buildbarn components]({{ '/assets/images/remote-execution-studio-architecture.jpg' | relative_url }}){: .robos-zoomable-img loading="lazy" }
*Concept diagram from the original design docs. The studio generates configuration text only; it does not deploy or monitor a cluster.*

It does not deploy or monitor a cluster. The **Test REAPI Endpoints** button returns fixed sample results (healthy, 14 ms and 11 ms) without contacting anything, and the two bundled sample clusters carry fixed sample cache hit ratios. There is no live telemetry. See the [app page]({{ '/apps/remote-execution-studio/' | relative_url }}).

## Agents that drive RobOS apps

RobOS apps load `packages/robos-lib/dom-snapshot.js`, which starts an HTTP debug server on a fixed port in the 19100 to 19199 range; `PORT_REGISTRY` in `snapshot-cli.js` lists them. The CLI reads and drives an app by CSS selector:

```bash
node packages/robos-lib/snapshot-cli.js task-servers --text
node packages/robos-lib/snapshot-cli.js task-servers --click 'button#btn-add'
node packages/robos-lib/snapshot-cli.js task-servers --fill 'input#server-name' --value 'Acme Jira'
```

The tests and demos above use the same mechanism. The debug server binds to `0.0.0.0` and has no authentication, and `--eval` runs JavaScript in the app, so use it only on a machine or VM you trust.

![AI Prompt pop-up with a multi-step objective floating over Agent Chat]({{ '/assets/images/screenshots/robos-agent-prompt-control-overlay.png' | relative_url }}){: .robos-zoomable-img loading="lazy" }
*Look at the AI Prompt pop-up on top of Agent Chat, with skills listed on the left.*

![AI Prompt pop-up floating over the Relational DB Manager]({{ '/assets/images/screenshots/agent-prompt-db-control-overlay.png' | relative_url }}){: .robos-zoomable-img loading="lazy" }
*Frame from a recorded demo run. Look at the pop-up over the Relational DB Manager and its table tree in the background.*

![REST API Client showing a generated Bruno request in the Bruno Source tab]({{ '/assets/images/screenshots/acme-petshop-step11-live_response_frame.png' | relative_url }}){: .robos-zoomable-img loading="lazy" }
*Frame from the same recorded demo run. Look at the request list on the left and the Bruno Source tab.*

![REST API Client with a JSON request body and a collection of requests on the left]({{ '/assets/images/screenshots/acme-petshop-step11-bruno-rest-client-frame_01.png' | relative_url }}){: .robos-zoomable-img loading="lazy" }
*Frame from the same recorded demo run. Look at the JSON request body and the collection list in the REST API Client.*

![Kube Studio showing one running pod in a namespace]({{ '/assets/images/screenshots/acme-petshop-step10-autodeployed_pods_frame.png' | relative_url }}){: .robos-zoomable-img loading="lazy" }
*Frame from the same recorded demo run. Look at the running pod in the Kube Studio table.*

![Agent Chat window with threads on the left and a message box with file and command suggestions]({{ '/assets/images/screenshots/agent-chat.png' | relative_url }}){: .robos-zoomable-img loading="lazy" }
*Look at the thread list on the left and the message box at the bottom of Agent Chat.*

The Unified MCP Router (`packages/robos-mcp-router`) is a stdio JSON-RPC server that merges the tool lists of MCP servers registered in `~/.config/robos/mcp/servers.json`. `packages/ekgraph-mcp` serves the `robos_ekgraph_*` knowledge graph tools and, for a graph workspace, `robos_sdlc_inspect`, `robos_sdlc_query`, `robos_sdlc_propose` and `robos_sdlc_apply`. The router's own built-in EKGraph, Kubernetes and REST tools are demo-grade: the EKGraph tools return fixed Acme Petshop sample data.

![Unified MCP Router console listing aggregated tools and resources with a dispatch log]({{ '/assets/images/screenshots/robos-mcp-router-frame_01.png' | relative_url }}){: .robos-zoomable-img loading="lazy" }
*Look at the aggregated tool and resource lists and the dispatch log below them.*

## Credentials in `pass`

DevOps integrations in the graph save tokens with `pass insert` under `devops/<category>/<provider>/<account>/<key>`, and the graph stores only the `pass` path. This needs `pass` and a GPG key set up. If `pass insert` fails, the code writes a base64-encoded, unencrypted placeholder file into the password store folder instead, so confirm `pass` works before you save credentials. The [Pass Manager]({{ '/apps/pass-manager/' | relative_url }}) app is a front end for the same store.

![Pipeline for storing DevOps credentials through GPG and the password store]({{ '/assets/images/devops-security-pass-pipeline.jpg' | relative_url }}){: .robos-zoomable-img loading="lazy" }
*Concept diagram from the original design docs. The text on this page says what is built, including the unencrypted placeholder written when pass insert fails.*

![DevOps Account Integrations dialog listing categories and providers such as GitHub, GitLab, Bitbucket and AWS]({{ '/assets/images/screenshots/devops-wizard-categories_frame.png' | relative_url }}){: .robos-zoomable-img loading="lazy" }
*Look at the category filters across the top and the provider cards below them.*

## Diagrams

These diagrams belonged to features that the sections above no longer cover. Each is a concept diagram, not a description of what is built.

![The C4 architecture model with four zoom levels from system context to code]({{ '/assets/images/c4-model-architecture.jpg' | relative_url }}){: .robos-zoomable-img loading="lazy" }
*Concept diagram from the original design docs. It shows a living C4 map generated from the graph. The text on this page says what is built today.*

![Layered contract-driven project graph from repository files through a core engine and a desktop canvas to agent execution]({{ '/assets/images/contract-project-graph-architecture.jpg' | relative_url }}){: .robos-zoomable-img loading="lazy" }
*Concept diagram from the original design docs. Consumer contract tests are not generated today, as the app generation section says, and the project graph app it shows is not in the repository.*

![Five tiers of agent rules and context, from global down to a single repository, inherited downward]({{ '/assets/images/agent-context-hierarchy.jpg' | relative_url }}){: .robos-zoomable-img loading="lazy" }
*Concept diagram from the original design docs. It shows rules inherited down a graph hierarchy. The text on this page says what is built today.*

## The rest of the suite

Database, API, Kubernetes, task planning and discussion tools are documented one app at a time in the [Apps catalog]({{ site.baseurl }}{% link apps.md %}).

![Database managers and a data sources explorer on top of a modular knowledge graph that describes PostgreSQL, MongoDB, Redis and S3 stores]({{ '/assets/images/data-sources-kgraph-architecture.jpg' | relative_url }}){: .robos-zoomable-img loading="lazy" }
*Concept diagram from the original design docs. The Apps catalog says what each data tool does today.*

![Data Sources app showing a connected PostgreSQL source with a schema inspector listing a table's columns]({{ '/assets/images/screenshots/data-sources-postgres_overview_frame.png' | relative_url }}){: .robos-zoomable-img loading="lazy" }
*Look at the connected source at the top and the table and column list in the Schema Inspector.*

![Data Sources app showing a Connection Verification dialog with a successful PostgreSQL handshake]({{ '/assets/images/screenshots/data-sources-test_connection_frame.png' | relative_url }}){: .robos-zoomable-img loading="lazy" }
*Look at the Connection Verification dialog opened by the Test Connection button.*

![Relational DB Manager showing a table's rows in a data grid beside a tree of connections and schemas]({{ '/assets/images/screenshots/dev-tools-table_data_grid_frame.png' | relative_url }}){: .robos-zoomable-img loading="lazy" }
*Look at the connection tree on the left and the data grid for the pets table on the right.*

![Four-stage API lifecycle: contract design, mock servers, Git-backed REST, gRPC and GraphQL clients, and verification gates]({{ '/assets/images/api-clients-verification-lifecycle.jpg' | relative_url }}){: .robos-zoomable-img loading="lazy" }
*Concept diagram from the original design docs. The REST, gRPC and GraphQL client pages say what each client does today.*

![Four stages from a visual architecture canvas through a Git-backed topology file to manifest synthesis and multi-cluster deployment]({{ '/assets/images/pillar4-declarative-gitops.jpg' | relative_url }}){: .robos-zoomable-img loading="lazy" }
*Concept diagram from the original design docs. The Apps catalog says which Kubernetes and deployment tools exist today.*

![Pipeline from a topology file in Git through manifest synthesis to cluster deployment]({{ '/assets/images/gitops-synthesis-pipeline.jpg' | relative_url }}){: .robos-zoomable-img loading="lazy" }
*Concept diagram from the original design docs. Same idea as above, shown as a pipeline.*

![Task planning flow from archetype templates through a synthesized plan to issue trackers and agent execution]({{ '/assets/images/interactive-task-planning-flow.jpg' | relative_url }}){: .robos-zoomable-img loading="lazy" }
*Concept diagram from the original design docs. Task Planner's page says what planning does today.*
