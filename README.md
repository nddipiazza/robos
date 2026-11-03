# RobOS

RobOS is one open-source app suite built to replace the apps you pay for, one at a time, all on one knowledge graph (KGraph). It has free desktop apps for shops, homes, players and developers: Point of Sale, Auto Center, Household finances, an audio and movie player, eLearning, games, smart-home tools and a developer suite. Every app is described in the KGraph, so you can use it as it is, customize it by describing the change, or describe a new app and have agents build it, with tests as proof.

RobOS also keeps and reuses what AI makes (code, graph nodes, skills and tests), so each new app needs less AI. Built once, an app runs with no AI at all. AI features inside the apps are optional and use the agent you already have (Claude Code, Codex, Copilot, Gemini CLI / Antigravity, or a local Ollama model).

Read more at **[rowbose.com](https://rowbose.com/)**.

Free and open source under the [Apache License 2.0](LICENSE).

---

The rest of this file is for developers. It has three parts:

1. **[Build RobOS](#part-1-build-robos)**: get the source, run and test the apps, and build installers, releases, the VM image and the docs.
2. **[Contribute to RobOS](#part-2-contribute-to-robos)**: how the apps are put together and how to add or change one.
3. **[Build your own code with RobOS](#part-3-build-your-own-code-with-robos)**: use the RobOS tools, agent skills and MCP servers on your own projects.

## Contents

- [Part 1: Build RobOS](#part-1-build-robos)
  - [Requirements](#requirements)
  - [Get the source and run an app](#get-the-source-and-run-an-app)
  - [Repository layout](#repository-layout)
  - [Run the tests](#run-the-tests)
  - [Debug a running app](#debug-a-running-app)
  - [Build the installers](#build-the-installers)
  - [Version and release](#version-and-release)
  - [Build the VM image](#build-the-vm-image)
  - [Build the docs](#build-the-docs)
  - [CI](#ci)
- [Part 2: Contribute to RobOS](#part-2-contribute-to-robos)
  - [How an app is put together](#how-an-app-is-put-together)
  - [Add, rename or remove an app](#add-rename-or-remove-an-app)
  - [Change an existing app](#change-an-existing-app)
  - [Shared libraries](#shared-libraries)
  - [AI features are optional](#ai-features-are-optional)
  - [Writing tests](#writing-tests)
  - [This repository's knowledge graph](#this-repositorys-knowledge-graph)
  - [Conventions](#conventions)
  - [Pull requests](#pull-requests)
- [Part 3: Build your own code with RobOS](#part-3-build-your-own-code-with-robos)
  - [What you need](#what-you-need)
  - [Plan, implement, review](#plan-implement-review)
  - [Start a new project](#start-a-new-project)
  - [Import an existing project](#import-an-existing-project)
  - [Model your system in a knowledge graph](#model-your-system-in-a-knowledge-graph)
- [Agent skills](#agent-skills)
- [MCP servers](#mcp-servers)
- [Documentation](#documentation)
- [Community](#community)
- [License](#license)

---

# Part 1: Build RobOS

## Requirements

| Need | For |
|---|---|
| Node.js 20+ and npm | Everything |
| Git | Everything |
| Docker | The headless end-to-end test container |
| QEMU/KVM | The appliance VM image (optional) |
| JDK 17+ and Gradle | The IntelliJ IDEA plugin (optional) |
| Godot 4 | The games in `games/` (optional) |
| Ruby, Jekyll and Bundler | The docs sites (optional) |

`scripts/install-dev-deps.sh` checks for and installs the dependencies of every component.

## Get the source and run an app

```bash
git clone https://github.com/nddipiazza/robos.git
```

```bash
cd robos
```

```bash
scripts/dev-launch.sh point-of-sale
```

`dev-launch.sh` runs `npm install` in the app's package the first time, then starts it with Electron. Run it with no argument to list every app it can launch.

There is **no root `package.json`**. Each package under `packages/` is independent, with its own `package.json` and `node_modules`. You can also work inside one package:

```bash
cd packages/point-of-sale && npm install && npm start
```

On GNOME, `scripts/install-local.sh` adds the apps to the application launcher.

## Repository layout

| Path | Contents |
|---|---|
| `packages/` | Apps, shared libraries and MCP servers, one directory each |
| `packages/robos-lib/` | Shared runtime code: agent wrapper, prompt security, DOM snapshots, agent selector, evidence capture |
| `packages/robos-graph/` | Knowledge graph engine, SHACL validation, the `kgraph` CLI and the KGraph Explorer app |
| `packages/robos-test/` | Test harness, unit tests and end-to-end tests |
| `packages/app-manager/` | The installer and launcher shipped to Windows, Ubuntu and macOS |
| `packages/app-wizard/` | Project generator and templates |
| `packages/*-mcp/`, `packages/robos-mcp-lib/`, `packages/robos-mcp-router/` | MCP servers, their framework, and the router agents connect to |
| `.robos/` | This repository's own knowledge graph |
| `plugins/` | The agent skill library (`plugins/robos/skills/`), its installer, and the IntelliJ IDEA plugin |
| `.agents/`, `.claude/`, `.antigravity/`, `.gemini/`, `.github/skills/` | The same skills, in the form each agent reads |
| `docs/` | Documentation site (Jekyll), published at [rowbose.com/v1/](https://rowbose.com/v1/) |
| `site/` | Front site (Jekyll), published at [rowbose.com](https://rowbose.com/) |
| `games/` | Godot games and their tooling |
| `infra/docker/` | The containerized E2E runner |
| `infra/desktop/` | The appliance VM image build |
| `installer/` | Installer for the appliance OS |
| `scripts/` | Launch, install, build, release and docs tooling |

## Run the tests

Unit tests need no display:

```bash
cd packages/robos-test && npm install && npm run test:unit
```

End-to-end tests launch real Electron apps and drive them over a debug port. Run them in the container, which supplies a virtual display:

```bash
./scripts/e2e-container.sh
```

```bash
./scripts/e2e-container.sh --build
```

```bash
./scripts/e2e-container.sh node packages/robos-test/tests/dev-central/e2e.test.js
```

`--build` rebuilds the image first. Passing a command runs only that test. `--interactive` opens a shell inside the container.

Other suites in `packages/robos-test/package.json`:

| Script | Covers |
|---|---|
| `npm run test:e2e` | The E2E suite outside the container (needs a display) |
| `npm run test:kgraph-workspace` | Graph workspaces, the source extractor, review and the `robos_sdlc_*` MCP tools |
| `npm run test:inspector`, `npm run test:topology` | KGraph Explorer's inspector and topology views |
| `npm run test:config-sync` | Config backup and sharing |
| `npm run test:vm` | Smoke test against the running VM |

Some apps keep their own tests in `packages/<app-id>/tests/`. Run them from that package with `npm test` and `npm run test:e2e`.

## Debug a running app

Each app opens a debug port (19100 and up, listed in `PORT_REGISTRY` in `packages/robos-lib/snapshot-cli.js`). With the app running:

```bash
node packages/robos-lib/snapshot-cli.js <app-id> --text
```

```bash
node packages/robos-lib/snapshot-cli.js <app-id> --json
```

```bash
node packages/robos-lib/snapshot-cli.js <app-id> --screenshot
```

Electron and RobOS failure logs are covered by the `read-error-logs` skill.

## Build the installers

RobOS ships as the App Manager (`packages/app-manager`): a Windows EXE, an Ubuntu `.deb`, a Linux AppImage and macOS DMGs. The base download holds the manager and one Electron runtime; each app, its libraries and game data are separate archives listed in a catalog. Build on the platform you are targeting so native dependencies match:

```bash
cd packages/app-manager && npm install && cd ../..
```

```bash
node --test packages/app-manager/test/*.test.cjs
```

```bash
node scripts/app-manager/build.cjs
```

```bash
node scripts/app-manager/publish-catalog.cjs
```

`build.cjs --linux` builds the `.deb` and AppImage. `publish-catalog.cjs --apps notifications,point-of-sale` builds a small catalog for debugging. The smoke test, the clean-Ubuntu install test and the per-app release audit are described, with the full packaging and publishing rules, in [scripts/app-manager/README.md](scripts/app-manager/README.md).

## Version and release

The version lives in `VERSION` and must match `packages/app-manager/package.json`.

```bash
bash scripts/bump-version.sh patch
```

That updates `VERSION` and every `package.json` and creates the git tag. It also accepts `minor`, `major` or an explicit version such as `1.2.3`.

Official releases are built and published by the `app-manager.yml` workflow when a version tag is pushed, after the unit suite, the Windows app regression workflow and every platform build pass. A `codex/release-*` branch runs the same gates and uploads drafts only. Merge the version bump to `main` straight after a release, because the site's download links follow `VERSION`.

For a local build of the packages tarball, cloud-init seed ISO and checksums:

```bash
bash scripts/release-build.sh --dry-run
```

```bash
bash scripts/release-build.sh
```

Add `--with-qcow2` to include the VM disk image. Output goes to `release/`.

## Build the VM image

The optional appliance is an Ubuntu desktop image for QEMU/KVM with every app preinstalled.

```bash
infra/desktop/build.sh
```

```bash
infra/desktop/run.sh
```

```bash
infra/desktop/clean.sh
```

The `build-vm`, `start-vm`, `stop-vm`, `vm-status`, `vm-ssh` and `deploy-to-vm` skills wrap these. The VM listens for SSH on port 2224. When you copy packages into `/usr/local/share/robos/` by hand, run `sudo chmod -R a+rX` on it and reinstall `node_modules` there, because copying dereferences Electron's symlinks.

## Build the docs

```bash
scripts/build-docs.sh
```

That builds `site/` to `_site/` and `docs/` to `_site/v1/`, as the `pages.yml` workflow does. It needs Jekyll and the gems in `docs/Gemfile`. Two docs pages are generated:

```bash
node scripts/sync-app-docs.js
```

```bash
node scripts/generate-mcp-docs.js
```

The first refreshes the per-app pages in `docs/_apps/`. The second rebuilds the MCP reference (see [MCP servers](#mcp-servers)); `--check` fails if it is out of date.

## CI

Workflows are in `.github/workflows/`:

| Workflow | Does |
|---|---|
| `app-manager.yml` | Builds and tests the App Manager and app archives for every OS and CPU, and publishes releases |
| `resume-app-release.yml` | Resumes an interrupted publish without rebuilding |
| `windows-apps.yml` | Windows app-suite regression |
| `kgraph-aggregate.yml` | Checks the aggregate graph file matches the graph packages |
| `household.yml` | Household app and tax engine tests |
| `pages.yml` | Builds and publishes rowbose.com |
| `game-release.yml`, `midterms-release.yml` | Standalone game downloads |
| `appliance-release.yml` | Manual: adds the optional VM images to an existing release |

---

# Part 2: Contribute to RobOS

Read [CONTRIBUTING.md](CONTRIBUTING.md) for how contributions are scoped and reviewed, and [AGENTS.md](AGENTS.md) for the full architecture, conventions and known gotchas. This part covers what you need to make a change.

## How an app is put together

Apps are Electron with plain JavaScript. There is no UI framework.

```
packages/<app-id>/
  main.js            Electron main process: windows, ipcMain handlers, data
  preload.js         contextBridge API exposed to the renderer
  renderer/          index.html, CSS and JavaScript for the UI
  lib/               app logic that runs and tests without Electron
  tests/             the app's own tests (optional)
  package.json       the app's own dependencies and scripts
  icon.svg           48×48 app icon
  <app-id>.desktop   launcher entry
```

**IPC.** The renderer has no Node access (`contextIsolation: true`, `nodeIntegration: false`). It calls an API that `preload.js` exposes, which forwards to `ipcMain.handle` in `main.js`:

```js
// preload.js
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('robos', {
  listItems: () => ipcRenderer.invoke('items:list'),
  saveItem: (item) => ipcRenderer.invoke('items:save', item),
});
```

```js
// main.js
ipcMain.handle('items:list', () => store.list());
ipcMain.handle('items:save', (_e, item) => store.save(item));
```

```js
// renderer/app.js
const items = await window.robos.listItems();
```

**State.** Persistent data lives under `~/.config/robos/`. Call `app.setPath('userData', ...)` before `requestSingleInstanceLock()` so each app has its own Electron profile and lockfiles do not collide.

**Electron flags.** Apps run with `--no-sandbox --disable-gpu --disable-dev-shm-usage`. Without `--disable-dev-shm-usage`, windows render blank in VMs and containers.

**Logic in `lib/`.** Keep business logic out of `main.js` so it can be tested with `node --test` and no display. `packages/point-of-sale/lib/` is a good model.

**Theme.** `--bg-primary: #0d1117`, `--bg-card: #161b22`, `--border: #30363d`, `--accent: #00bcd4`, `--text-main: #c9d1d9`, `--text-muted: #8b949e`.

## Add, rename or remove an app

An app is registered in several places: the launcher, the icon registries, the knowledge graph and the docs. The `create-robos-app`, `rename-robos-app` and `remove-robos-app` skills handle all of them. In Claude Code:

```
/create-robos-app <app-id> <one-line description>
```

To do it by hand:

1. `packages/<app-id>/`, with its `<app-id>.desktop` entry
2. `packages/desktop-manager/main.js`: `APP_REGISTRY` and `APP_BINS`
3. `packages/robos-icons/builtin-apps.js`: `BUILTIN_APPS` (alphabetical)
4. `packages/robos-icons/builtin-apps-browser.js`: `ROBOS_BUILTIN_APPS`
5. The App Suite table in `AGENTS.md`
6. The app's node in `.robos/kgraphs/`, plus `.robos/kgraph.yaml` and `.robos/packages.yaml`
7. A debug port in `PORT_REGISTRY` in `packages/robos-lib/snapshot-cli.js`, and in `PORT_MAP` in `packages/robos-test/lib/harness.js` if it has shared E2E tests

Then run `node scripts/sync-app-docs.js` to create its page in `docs/_apps/`.

## Change an existing app

1. Branch from `main`.
2. Run it with `scripts/dev-launch.sh <app-id>`. The UI is in `renderer/`, IPC in `main.js` and `preload.js`, logic in `lib/`.
3. Make the change. If it adds or changes what the app *is* (a screen, an entity, an API, a test), update the app's node in the knowledge graph too.
4. Add or update tests and run them.
5. Commit with a [Conventional Commit](https://www.conventionalcommits.org/) scoped to the package, for example `fix(point-of-sale): round tax per line`.

## Shared libraries

| Module | Gives you |
|---|---|
| `robos-lib/ai-agent.js` | `ask(prompt, opts)`: runs the user's active agent CLI (or the opt-in API mode) with the prompt security guard applied |
| `robos-lib/agent-selector.js` | `<robos-agent-selector>`, the shared agent picker |
| `robos-lib/ai-json.js` | `parseAIJson` and `JSON_RULES_PROMPT` for parsing and repairing JSON from agents |
| `robos-lib/dom-snapshot.js` | The debug server behind the snapshot CLI and the tests |
| `robos-lib/evidence-runner.js` | Review evidence capture, also usable from the command line |
| `robos-lib/config-sync.js` | Back up and share `~/.config/robos` |
| `robos-icons/` | SVG icon registry and the list of built-in apps |
| `robos-ui/` | Shared UI components |
| `robos-mcp-lib/` | The framework every MCP server is built on |

On the VM, shared code is installed under `/usr/local/share/robos/`. That path does not exist elsewhere, so load shared modules with a fallback:

```js
let aiAgent = null;
for (const p of [
  path.resolve(__dirname, '..', 'robos-lib', 'ai-agent'),
  '/usr/local/share/robos/robos-lib/ai-agent',
]) {
  try { aiAgent = require(p); break; } catch {}
}
```

## AI features are optional

Every app must work fully with no agent configured.

- Put AI behind an explicit action: a `<robos-ai-textarea>` with an adjacent `✦` button that starts disabled. The `add-ai-text-area-to-app` skill wires this up.
- Let the user choose the agent with `<robos-agent-selector>`.
- Send one-shot requests through `robos-lib/ai-agent` `ask()`. That is where prompts are scanned for secrets, personal data and prompt injection. Don't call an agent CLI or a model API directly.
- Ground the prompt in the app's own data and its KGraph slice.
- Never depend on the API mode (`robos-llm`); it is off by default.

The Audio Player's AI Playlists and Virtual DJ (`packages/audio-player/`) are the reference implementation.

## Writing tests

Shared tests live in `packages/robos-test/tests/<app-id>/` and use the harness in `packages/robos-test/lib/`: `harness.js` launches and stops apps, `snapshot.js` reads the DOM, `scenarios.js` sets up app state.

- Use only selectors that exist in the app's `renderer/` files. Grep for them before writing an assertion.
- Don't call a real agent or network service. Inject the expected result.
- Wait for text or state instead of sleeping.

The `create-test` skill writes a test that follows these rules. The `e2e-driven-dev` skill writes the E2E test first, then records a narrated walkthrough when it passes. Recordings are saved under `~/.robos/development/walkthroughs/<slug>/`.

## This repository's knowledge graph

`.robos/` describes the RobOS apps, services, contracts and work in JSON-LD, validated with SHACL shapes.

- `.robos/kgraph.yaml` indexes the graph packages.
- `.robos/kgraphs/<package>/package.jsonld` holds each package's nodes.
- `.robos/knowledge-graph.jsonld` is the aggregate of all packages.

After editing a package file by hand, regenerate the aggregate. Apps that read the graph fail to start if the two disagree, and CI checks it:

```bash
node packages/crpg-builder/scripts/sync-aggregate.js
```

```bash
node packages/robos-graph/bin/kgraph-cli.js validate
```

Never put secrets in the graph. Credentials are stored in `pass`, and the graph holds only a reference to their path. If your change touches `.robos/kgraphs/`, include the `kgraph diff` output in your pull request.

## Conventions

- **Commits:** [Conventional Commits](https://www.conventionalcommits.org/) (`feat:`, `fix:`, `docs:`, `refactor:`, `test:`, `chore:`), scoped to the package.
- **No root `package.json`.**
- **IPC** only through `contextBridge` and `ipcRenderer.invoke()` / `ipcMain.handle()`. Never `nodeIntegration: true`.
- **Data** in `~/.config/robos/`.
- **Logging** with `pino`.
- **Icons:** 48×48 SVG, Lucide style, `stroke="#00bcd4"`, `stroke-width="1.5"`, round caps and joins.
- **Docs:** don't write counts of things that grow ("the app suite", not "30+ apps").

## Pull requests

1. One change per pull request.
2. Include the test output. For app changes, run `./scripts/e2e-container.sh`.
3. For visible changes, link a recorded walkthrough (the `record-demo` skill).
4. For graph changes, include the `kgraph diff` result.
5. Say how you briefed the agent, if you used one: the prompt, spec or skill.

Feature ideas go in [`docs/ideas/`](docs/ideas/) (the `create-feature-spec` skill writes one) and reported problems in [`docs/issues/`](docs/issues/) (the `report-issue` skill).

---

# Part 3: Build your own code with RobOS

RobOS includes the tools it was built with. You can point them at your own repositories: plan work as issues, have an agent implement each one on a branch, review the branch with recorded evidence, and keep a knowledge graph of your system that agents can query.

## What you need

- RobOS, installed or run from a clone of this repository.
- At least one agent CLI, installed and signed in: Claude Code (`claude`), Codex (`codex`), GitHub Copilot (`copilot` / `gh copilot`) or Antigravity / Gemini CLI (`agy` / `gemini`). Set it as active in **RobOS Agents**. RobOS does not ship a model and needs no API keys.
- The GitHub CLI, `gh`, signed in.
- A task server for your project, a GitHub repository or a Jira project, added in **Task Servers**.
- A local clone of your repository with `origin` on GitHub.

Some apps call a specific CLI instead of the active one. Task Planner's generator uses `gh copilot`; the review window's agent features and evidence capture use `codex`. The [Build apps guide](https://rowbose.com/build-apps/) lists which agent each app runs.

## Plan, implement, review

| Step | App | What happens |
|---|---|---|
| Plan | `task-planner` | Describe the work. An agent drafts epics and tasks with acceptance criteria and a developer persona. You edit them and create them as issues. |
| Implement | `task-implementer` | Pick an issue and start the agent. It creates a branch (`codex/<task-key>` by default), implements and tests the task, commits and pushes. It does not open a pull request. |
| Review | `pr-review` | Read the diff, ask for changes in plain language, check before-and-after evidence, and step through an agent-led walkthrough. Open the branch in IntelliJ IDEA or VS Code from the same window. |
| Publish | `pr-review` | Create the pull request (as a draft if you like) and watch CI. |
| Merge | GitHub | You merge. RobOS has no merge button. |

Task Implementer works in the folder it was started from, so start it from your clone:

```bash
cd ~/src/my-app
```

```bash
~/robos/scripts/dev-launch.sh task-implementer
```

Task Implementer runs the agent as your user with permission prompts off and no sandbox. Use it only on repositories and machines where that is acceptable, and run one agent per clone at a time.

Step-by-step guides: [building on your own](https://rowbose.com/build-apps/solo/) and [building as a team](https://rowbose.com/build-apps/teams/).

## Start a new project

The App Wizard (`packages/app-wizard`) generates a starter project and registers it in a knowledge graph:

```bash
scripts/dev-launch.sh app-wizard
```

Choose **Create New Project**. It writes to `packages/<slug>/` under the nearest `.robos` directory. Templates: a Next.js web app (the launch kit in `packages/app-wizard/templates/nextjs-vercel-web`, with auth, abuse controls, SEO and recorded Playwright tests), an Electron desktop app, a Node.js CLI and a Node.js HTTP service. Each comes with a Backstage `catalog-info.yaml` and a `dev-setup.sh`. Details, including which project types don't have their own template yet: [New app wizard](https://rowbose.com/v1/new-app-wizard.html).

## Import an existing project

Choose **Import Existing Code** in the App Wizard to add repositories, URLs, databases and services to the knowledge graph. It builds nodes mostly from names and top-level files, so check the result: [Import an existing app](https://rowbose.com/v1/app-import-wizard.html).

For evidence-backed import of whole repository catalogs (GitHub or GitLab orgs, local folders, S3 or HTTP), use the `import-company-kgraph` skill.

## Model your system in a knowledge graph

A graph workspace keeps a knowledge graph for your own project, separate from the RobOS one. Set `ROBOS_GRAPH_ROOT` to your project (or pass `--graph-root`):

```bash
export ROBOS_GRAPH_ROOT=~/src/my-app
```

```bash
node ~/robos/packages/robos-graph/bin/kgraph-cli.js init
```

```bash
node ~/robos/packages/robos-graph/bin/kgraph-cli.js inspect
```

`init` creates `.robos/` in the project. `context` prints a brief for your agent; the agent returns JSON edits; `propose --file <edits.json>` validates them and shows the diff; `apply --file <proposal>` commits them. Nothing is written to the graph without that review step. The source extractor reads tracked files without running any repository code and attaches evidence (file, line, revision, SHA-256) to each node it creates.

Once the graph exists:

```bash
node ~/robos/packages/robos-graph/bin/kgraph-cli.js search "orders"
```

```bash
node ~/robos/packages/robos-graph/bin/kgraph-cli.js impact <node-id> --depth 2
```

```bash
node ~/robos/packages/robos-graph/bin/kgraph-cli.js diff my-branch
```

```bash
node ~/robos/packages/robos-graph/bin/kgraph-cli.js visualize --direction LR
```

Open KGraph Explorer (`scripts/dev-launch.sh robos-graph`) with the same `ROBOS_GRAPH_ROOT` to browse it and use **Import & Refine**. Agents reach the same workspace through the `robos_sdlc_*` MCP tools. The full model, including evidence rules and conflict handling, is in [WORKSPACES.md](packages/robos-graph/WORKSPACES.md). The node types and shapes are in [Schemas](https://rowbose.com/v1/schemas.html).

---

# Agent skills

A skill is a folder holding a `SKILL.md`: a short YAML header (`name`, `description`) and Markdown instructions an agent follows to do one task, such as scaffolding an app, running the E2E container, recording a demo or querying the graph. `$ARGUMENTS` in the body is replaced with what you type after the skill's name. Agents load a skill when you name it (`/create-robos-app ...` in agents with slash commands) or when its description matches what you asked for.

```
---
name: app-snapshot
description: Capture DOM snapshots (text, JSON, or screenshot) from running RobOS Electron apps.
---

# Capture RobOS App DOM Snapshot

## Input
$ARGUMENTS — `<app-id>` optionally followed by `--json` or `--screenshot`
...
```

**Skill library: [`plugins/robos/skills/`](plugins/robos/skills/)**, with every skill listed in the [skills catalog](docs/skills/skills-catalog.md) ([on the docs site](https://rowbose.com/v1/robos-skills.html)).

Skills are written once there and installed in the place each agent reads:

| Agent | Reads skills from | Install |
|---|---|---|
| Claude Code | Plugin marketplace, or `.claude/commands/` | `claude plugin marketplace add ./plugins` then `claude plugin install robos`, or `./plugins/install.sh --target claude` |
| OpenAI Codex | `.agents/skills/<name>/SKILL.md` and `AGENTS.md` | `./plugins/install.sh --target codex` |
| Google Antigravity | `.antigravity/commands/` and `.agents/skills/` | `./plugins/install.sh --target antigravity` |
| GitHub Copilot | `.github/skills/` and `AGENTS.md` | `./plugins/install.sh --target copilot` |
| Gemini CLI | `.gemini/commands/` and `AGENTS.md` | `./plugins/install.sh --target gemini` |

```bash
./plugins/install.sh
```

```bash
./plugins/install.sh --global
```

The first syncs every agent's copy inside this repository. The second installs into your user profile (`~/.claude`, `~/.agents`, ...) so the skills are available in your own projects too. `--skill <name>` syncs one skill and `--dry-run` shows what would change.

**Write a skill.** Add `plugins/robos/skills/<name>/SKILL.md`, then run `./plugins/install.sh --sync` to copy it to every agent's folder. Name a script or command for every step and say how to verify the result. The `manage-robos-skill` skill adds, updates or removes one for you. Per-agent manifests are in `plugins/robos/` (`plugin.json`, `codex-plugin.json`, `antigravity-plugin.json`, `copilot-plugin.json`); setup details for each agent are in [plugins/README.md](plugins/README.md).

[AGENTS.md](AGENTS.md) is the instruction file every agent reads in this repository. `CLAUDE.md`, `GEMINI.md` and `ANTIGRAVITY.md` point to it.

# MCP servers

RobOS exposes tasks, the knowledge graph, workspaces, CI, the IDE and the desktop to agents through [Model Context Protocol](https://modelcontextprotocol.io/) servers.

| Server | Package | Tool prefix |
|---|---|---|
| Task Manager | `packages/task-manager-mcp` | `robos_tasks_*` |
| EKGraph | `packages/ekgraph-mcp` | `robos_ekgraph_*`, `robos_sdlc_*`, `robos_schema_*`, `robos_kgraph_semantic_search` |
| Workspace Manager | `packages/workspace-manager-mcp` | `robos_workspace_*` |
| CI Monitor | `packages/ci-monitor-mcp` | `robos_ci_*` |
| IDE Bridge | `packages/ide-bridge-mcp` | `robos_ide_*` |
| System | `packages/system-mcp` | `robos_system_*` |
| Dev Tools | `packages/dev-tools-mcp` | `robos_devtools_*` |

**API contract.** Every tool's description and JSON input schema, and every resource, are in the [MCP server reference](docs/mcp-servers.md), with the same data in the `tools/list` / `resources/list` shape in [`docs/mcp/tools.json`](docs/mcp/tools.json). Both are generated from the server definitions by `node scripts/generate-mcp-docs.js`, so regenerate them when you change a server.

**Connect an agent.** Agents connect to one stdio server, the router in `packages/robos-mcp-router`, which merges the tools of every RobOS server registered in `~/.config/robos/mcp/servers.json` and forwards each call to the server that owns the tool:

```json
{
  "mcpServers": {
    "robos": {
      "command": "node",
      "args": ["/path/to/robos/packages/robos-mcp-router/cli.js", "--stdio"]
    }
  }
}
```

That block goes in `.mcp.json` for Claude Code; `node packages/robos-mcp-router/cli.js --claude-config` prints the VM version. For Codex, add `[mcp_servers.robos]` with the same `command` and `args` to `~/.codex/config.toml`.

**Run a server.** Each package exports a factory from `server.js`. Given a port, the server serves JSON-RPC on `POST /mcp` and `GET /health`, and registers its endpoint so the router can forward to it:

```bash
node -e "require('./packages/task-manager-mcp/server').createTaskMCPServer({ port: 7311 })"
```

The `robos_sdlc_*` graph tools are only offered when `ROBOS_GRAPH_ROOT` points at a graph workspace. New servers are built on `packages/robos-mcp-lib` (`createMCPServer({ appId, name, version, port, tools, resources })`); the reference page shows a complete example. Server tests are in `packages/robos-test/tests/mcp-servers/`.

# Documentation

- [rowbose.com](https://rowbose.com/): what RobOS is, the apps and the downloads
- [Documentation](https://rowbose.com/v1/): installation, architecture, the knowledge graph, schemas and every app
- [Build apps](https://rowbose.com/build-apps/): the plan, implement and review guides
- [System architecture](https://rowbose.com/v1/architecture.html)
- [Knowledge graph](https://rowbose.com/v1/knowledge-graph.html) and [schemas](https://rowbose.com/v1/schemas.html)
- [AI agents and API mode](https://rowbose.com/v1/ai-providers.html)
- [Skills](https://rowbose.com/v1/robos-skills.html) and the [skills catalog](docs/skills/skills-catalog.md)
- [MCP server reference](docs/mcp-servers.md)
- [Game development](https://rowbose.com/v1/game-development.html) and the [cRPG guide](games/crpg-realm/AGENTS.md)
- [AGENTS.md](AGENTS.md): the reference for agents and contributors

# Community

Questions and proposals: [GitHub Discussions](https://github.com/nddipiazza/robos/discussions). Bugs: [Issues](https://github.com/nddipiazza/robos/issues). Conversation: [Discord](https://discord.gg/6PjxzkHujE).

# License

Apache License 2.0. See [LICENSE](LICENSE).
