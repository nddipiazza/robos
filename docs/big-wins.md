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

Run a demo inside the Docker test container, which starts Xvfb on `:99` at 1920x1080 and needs Docker on the host:

```bash
./scripts/e2e-container.sh node packages/robos-test/demos/notifications-demo.js
```

Each run is copied to `~/.robos/development/walkthroughs/<slug>/` as `<slug>-final.webm`, `<slug>.vtt` and a `walkthrough.md` step table, with timestamped copies under `history/`. The `record-demo` skill (`plugins/robos/skills/record-demo`) tells an agent how to write these scripts.

In PR Review, the evidence runner (`packages/robos-lib/evidence-runner.js`) rejects an agent result that marks a scenario as passed without a captured artifact inside the run folder. Not built yet: producing a narrated video automatically from an arbitrary test run. The demo script is written by a person or an agent. See [Walkthroughs and proof of work]({{ site.baseurl }}{% link walkthroughs.md %}).

## Review gates in PR Review Theater

The [PR Review app]({{ '/apps/pr-review/' | relative_url }}) shows a review as a sequence of steps: Description, Overview, Documentation, Changes, Open in IDE, Evidence, Walkthrough and Approve. Local reviews that have no pull request yet also get a Pull Request step. For pull requests with knowledge graph context, the default team configuration adds a reviewer knowledge check in the Overview step, with a pass score of 80, that locks the diffs and sign-off until it is passed, and it marks the evidence step as required. The Walkthrough step has an agent demonstrate the change in a real browser one checkpoint at a time, and it can run the same checkpoints against a separate checkout of the base revision.

These gates live in the app. They are not GitHub branch protection rules. Local reviews, which have no pull request yet, turn the knowledge check off. Details are on [PR Review Theater]({{ site.baseurl }}{% link pr-review-theater.md %}).

The Open in IDE step has a VS Code path and an IntelliJ path. For VS Code, the app opens a `vscode://github.vscode-pull-request-github/open-pr?number=<n>&repo=<repo>` link, which needs the GitHub Pull Requests and Issues extension, and runs `code --goto`. For IntelliJ, the Kotlin plugin in `plugins/intellij-idea` runs a local server on port 63343 with endpoints to open a file, set a breakpoint, manage run configurations and read thread state. The app posts to `/api/robos/pull-request/open`, which that plugin does not serve, so in practice it falls back to `idea --line <n> <file>`. The step list the app prints afterwards (checking out the branch, activating the Pull Request tool window) is fixed text, not a report of what the IDE did.

## Knowledge graph diff and blast radius

`packages/robos-graph` keeps a JSON-LD knowledge graph as packages under `.robos/kgraphs/<package>/package.jsonld`, catalogued by `.robos/kgraph.yaml`, and validates nodes against SHACL shapes. In the graph app, the **Blast Radius** button on a node lists what depends on it. The CLI does the same, and it can diff two graph documents:

```bash
node packages/robos-graph/bin/kgraph-cli.js impact "urn:robos:service:auth-service" --depth 2
node packages/robos-graph/bin/kgraph-cli.js diff feature/TASK-101-auth --base main --json
```

`diff` reports added, removed and modified nodes, a risk level (high when a contract or microservice is removed), and the services, contracts, requirements and teams within three dependency hops of the changes.

The "dual state" is only partly built. The branches that the graph app and `kgraph diff` compare are in-memory copies of the loaded graph plus a few built-in sample branches. They are not read from your Git branches, so a diff does not yet reflect a real feature branch. The plain-text output of `kgraph diff` also prints zero counts, so use `--json`. Schema drift detection is not implemented.

Two parts are solid. Imports into an external graph workspace (`ROBOS_GRAPH_ROOT`) go through `kgraph propose` and `kgraph apply`, with hash-checked proposals, three-way conflict detection, a write lock and `kgraph recover` for interrupted writes. External knowledge graph repositories can be pinned by Git tag and are cloned shallowly into `~/.robos/cache/kgraphs/<repo>@<tag>/`, but if the clone fails the code creates a stub package with a placeholder node instead of reporting an error. See [Knowledge graph]({{ site.baseurl }}{% link knowledge-graph.md %}) and the [robos-graph app page]({{ '/apps/robos-graph/' | relative_url }}).

## Sandboxes for agent runs

`packages/robos-profiled` is a daemon plus two commands. Start the `robos-profiled` app first, because the commands talk to it over `~/.config/robos/profiled/profiled.sock`. Then `robos-run-as --agent <name> [--autoclean] <command>` creates a profile named `my-agent-<name>` and runs the command with `HOME` pointing at a private folder. When the daemon runs as root, that folder is a 2 GB `tmpfs` mount with mode 0700. Otherwise it is an ordinary folder under `~/.config/robos/profiled/homes/`. `--autoclean`, or `robos-profile terminate <name>`, unmounts and deletes it.

This keeps stray files out of your home folder. It is not a security boundary:

- No Linux user is created. The command runs as the user who started the daemon, and the `uid` in a profile record is only a stored number.
- No cgroup or memory limit is applied, although profiles record a memory value and a scope name.
- The profile uses the host display, with a copy of your X authority file, not a private display.
- It forwards your SSH agent socket, GPG agent socket and `.gitconfig`, and writes `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GEMINI_API_KEY` and `GITHUB_TOKEN` into the profile's `.bashrc`. If a variable is unset, a placeholder value is written.

For stronger isolation, run agents and tests in the Docker container (`./scripts/e2e-container.sh`, built from `infra/docker`). It mounts the repository at `/workspace` read-write and discards everything else when the container exits. See the [robos-profiled app page]({{ '/apps/robos-profiled/' | relative_url }}).

## Prompt security

`packages/robos-lib/prompt-security.js` scans the prompt text before it reaches an agent. It uses a built-in regular-expression catalog: cloud and Git tokens (AWS, GitHub, GitLab, Slack, Stripe, Anthropic, OpenAI, Google), private key blocks, passwords inside database and basic-auth URLs, JWTs, US Social Security numbers, card numbers that pass a Luhn check, emails, phone numbers, private IP addresses, and phrases typical of prompt injection and jailbreaks. A Shannon entropy check (default threshold 4.5 bits per character) catches secrets without a known prefix. The rules are modeled on Gitleaks, TruffleHog, Presidio and OWASP LLM01. Those tools are not run.

Set the mode under **Prompt Security & Guardrails** in the Preferences app: `redact` (default), `block`, `warn`, `audit-only` or `off`. It is stored as `prompt_security_mode` in `~/.config/robos/settings.json`. When a scan finds something, an entry with the finding types and counts, not the secret, is appended to `~/.config/robos/prompt-security-audit.json`, which keeps the last 200 entries.

The scan runs in the shared AI library `robos-lib/ai-agent` (and the optional API mode in `robos-llm`), in the `ai-prompt` and `agent-chat` apps, and in the `<robos-ai-textarea>` component. It checks the prompt you send. It does not check files an agent reads later or the output of its tools.

## Bring your own agent CLI

RobOS works with the coding-agent CLIs you already use: GitHub Copilot, Claude Code, Codex and Gemini CLI / Antigravity. Install one, sign in, and set it as active in RobOS Agents. One-shot requests across the apps go through `robos-lib/ai-agent`, which runs that CLI. The task runner in `robos-agent-client/work-task/backend.js` calls `codex exec` or `claude -p` for Dev Central, and `providers.js` lists Codex and Antigravity (`agy`) with their model catalogs, reading each CLI's stored login. An optional API mode (`robos-llm`, LangChain.js) can answer one-shot requests with Anthropic, OpenAI, Gemini or a local Ollama server instead; it is off by default. See [AI agents and API mode]({{ site.baseurl }}{% link ai-providers.md %}).

Limit: there is no shared session or routing layer. Each app starts its CLI itself, with the model that CLI is configured to use. How work could be assigned to agent tiers is on [Agent tiers]({{ site.baseurl }}{% link agent-tiers.md %}).

## Generating apps from the knowledge graph

The [App Wizard]({{ '/apps/app-wizard/' | relative_url }}) (`packages/app-wizard`) is where "knowledge graph first" exists today, in a narrow form. For a new app, `generateNewApp()` writes files for the chosen archetype, then registers a node in the `applications` or `services` graph package, adds an entry to `.robos/packages.yaml`, writes `catalog-info.yaml` and `dev-setup.sh`, and adds the folder to `~/.config/robos/git-projects.json`. Front-end apps get a Next.js template for Vercel with end-to-end test and evidence scripts. Desktop apps get an Electron skeleton, console apps a Node CLI skeleton, and microservices a plain Node HTTP server with an `openapi.yaml` stub and a Dockerfile.

The flow runs from wizard to files to graph, not from graph to code. TypeSpec models, API controllers, database migrations, devcontainers and consumer contract tests are not generated. The PC game, mobile app, data pipeline and library archetypes are offered in the wizard, but they receive the same Node server skeleton as microservices and no graph node. The wizard can also import existing code. See [New app wizard]({{ site.baseurl }}{% link new-app-wizard.md %}) and [Building apps]({{ site.baseurl }}{% link app-development-flow.md %}).

## Remote Execution Studio

`packages/remote-execution-studio` stores descriptions of Remote Execution API (REAPI v2) clusters, Buildbarn or NativeLink, and of Bazel or Buck2 build systems, and generates configuration text from them: `.bazelrc` with `build:remote` and `build:cache` profiles, `.buckconfig`, Buildbarn component configs (`bb-storage`, `bb-scheduler`, `bb-worker`, `bb-runner`, `bb-browser`) and a NativeLink config. Definitions are saved to `~/.config/robos/remote-execution.json` and as `robos:RemoteExecutionCluster` nodes in the `devops` graph package.

It does not deploy or monitor a cluster. The **Test REAPI Endpoints** button returns fixed sample results (healthy, 14 ms and 11 ms) without contacting anything, and the two bundled sample clusters carry fixed sample cache hit ratios. There is no live telemetry. See the [app page]({{ '/apps/remote-execution-studio/' | relative_url }}).

## Agents that drive RobOS apps

RobOS apps load `packages/robos-lib/dom-snapshot.js`, which starts an HTTP debug server on a fixed port in the 19100 to 19199 range; `PORT_REGISTRY` in `snapshot-cli.js` lists them. The CLI reads and drives an app by CSS selector:

```bash
node packages/robos-lib/snapshot-cli.js task-servers --text
node packages/robos-lib/snapshot-cli.js task-servers --click 'button#btn-add'
node packages/robos-lib/snapshot-cli.js task-servers --fill 'input#server-name' --value 'Acme Jira'
```

The tests and demos above use the same mechanism. The debug server binds to `0.0.0.0` and has no authentication, and `--eval` runs JavaScript in the app, so use it only on a machine or VM you trust.

The Unified MCP Router (`packages/robos-mcp-router`) is a stdio JSON-RPC server that merges the tool lists of MCP servers registered in `~/.config/robos/mcp/servers.json`. `packages/ekgraph-mcp` serves the `robos_ekgraph_*` knowledge graph tools and, for a graph workspace, `robos_sdlc_inspect`, `robos_sdlc_query`, `robos_sdlc_propose` and `robos_sdlc_apply`. The router's own built-in EKGraph, Kubernetes and REST tools are demo-grade: the EKGraph tools return fixed Acme Petshop sample data.

## Credentials in `pass`

DevOps integrations in the graph save tokens with `pass insert` under `devops/<category>/<provider>/<account>/<key>`, and the graph stores only the `pass` path. This needs `pass` and a GPG key set up. If `pass insert` fails, the code writes a base64-encoded, unencrypted placeholder file into the password store folder instead, so confirm `pass` works before you save credentials. The [Pass Manager]({{ '/apps/pass-manager/' | relative_url }}) app is a front end for the same store.

## The rest of the suite

Database, API, Kubernetes, task planning and discussion tools are documented one app at a time in the [Apps catalog]({{ site.baseurl }}{% link apps.md %}).
