# RobOS

RobOS is one open-source app suite built to replace the apps you pay for, one at a time, all on one knowledge graph (KGraph). It has free desktop apps for shops, homes, players and developers: Point of Sale, Auto Center, Household finances, an audio and movie player, eLearning, games, smart-home tools and a developer suite. Every app is described in the KGraph, so you can use it as it is, customize it by describing the change, or describe a new app and have agents build it, with tests as proof.

RobOS also keeps and reuses what AI makes (code, graph nodes, skills and tests), so each new app needs less AI. Built once, an app runs with no AI at all. AI features inside the apps are optional and use the agent you already have (Claude Code, Codex, Copilot, Gemini CLI / Antigravity, or a local Ollama model).

Read more at **[rowbose.com](https://rowbose.com/)**.

Free and open source under the [Apache License 2.0](LICENSE).

The rest of this file covers building code on RobOS.

---

## Contents

- [Requirements](#requirements)
- [Get the code and run an app](#get-the-code-and-run-an-app)
- [Repository layout](#repository-layout)
- [How an app is put together](#how-an-app-is-put-together)
- [Create a new app](#create-a-new-app)
- [Change an existing app](#change-an-existing-app)
- [Shared libraries](#shared-libraries)
- [Adding an AI feature](#adding-an-ai-feature)
- [Testing](#testing)
- [Debugging a running app](#debugging-a-running-app)
- [The knowledge graph](#the-knowledge-graph)
- [Working with coding agents](#working-with-coding-agents)
- [Docs and site](#docs-and-site)
- [The VM image](#the-vm-image)
- [Conventions](#conventions)
- [Contributing](#contributing)

## Requirements

- **Node.js 20+** and npm
- **Git**
- **Docker**, for the headless end-to-end test container
- Optional: **QEMU/KVM** for the appliance VM image, **JDK 17+ and Gradle** for the IntelliJ plugin, **Godot 4** for the games in `games/`, **Jekyll** for the docs sites

`scripts/install-dev-deps.sh` audits and installs the dependencies for every component.

## Get the code and run an app

```bash
git clone https://github.com/nddipiazza/robos.git
```

```bash
cd robos
```

```bash
scripts/dev-launch.sh point-of-sale
```

`dev-launch.sh` runs `npm install` in the app's package on first launch, then starts it with Electron. Run it with no argument to list every launchable app (any `packages/<id>/` with a `main.js` and `package.json`).

There is **no root `package.json`**. Every package under `packages/` is independent and has its own `node_modules`. You can also run an app from inside its package:

```bash
cd packages/point-of-sale && npm install && npm start
```

On GNOME, `scripts/install-local.sh` adds the apps to the application launcher.

## Repository layout

| Path | Contents |
|---|---|
| `packages/` | Apps, shared libraries and MCP servers, one directory each |
| `packages/robos-lib/` | Shared runtime code: AI agent wrapper, prompt security, DOM snapshots, agent selector, config sync |
| `packages/robos-graph/` | Knowledge graph engine, SHACL validation, `kgraph` CLI and the KGraph Explorer app |
| `packages/robos-test/` | Unit and end-to-end test harness and tests |
| `packages/app-wizard/` | App generator and templates (desktop apps, the `nextjs-vercel-web` launch kit) |
| `.robos/` | This repository's own knowledge graph (`kgraph.yaml`, `kgraphs/<package>/package.jsonld`) |
| `plugins/` | Agent skills marketplace (`plugins/robos/skills/`) and the IntelliJ IDEA plugin |
| `.agents/`, `.claude/`, `.antigravity/`, `.gemini/`, `.github/skills/` | The same skills, in the form each agent reads |
| `docs/` | Documentation site (Jekyll), published at rowbose.com/v1/ |
| `site/` | Front site (Jekyll), published at rowbose.com |
| `games/` | Godot games and their tooling |
| `infra/docker/` | Containerized E2E runner |
| `infra/desktop/` | Appliance VM image build |
| `installer/` | Installer for the appliance OS |
| `scripts/` | Launch, install, build, release and docs tooling |

## How an app is put together

Apps are Electron with plain JavaScript. There is no UI framework.

```
packages/<app-id>/
  main.js            Electron main process: windows, ipcMain handlers, data
  preload.js         contextBridge API exposed to the renderer
  renderer/          index.html, CSS and JavaScript for the UI
  lib/               app logic that can be unit tested without Electron
  tests/             the app's own tests (optional; see Testing)
  package.json       the app's own dependencies and scripts
  icon.svg           48×48 app icon
  <app-id>.desktop   launcher entry
```

**IPC.** The renderer never gets Node access (`contextIsolation: true`, `nodeIntegration: false`). It calls an API that `preload.js` exposes, which forwards to `ipcMain.handle` in `main.js`:

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

**State.** Persistent data lives under `~/.config/robos/` (for example `~/.config/robos/point-of-sale/`). Call `app.setPath('userData', ...)` before `requestSingleInstanceLock()` so each app gets its own Electron profile and lockfiles do not collide.

**Electron flags.** Apps run with `--no-sandbox --disable-gpu --disable-dev-shm-usage`. Without `--disable-dev-shm-usage`, renderer windows go blank in VMs and containers.

**Logic out of `main.js`.** Keep business logic in `lib/` as plain modules. That is what makes it testable with `node --test` and no display. `packages/point-of-sale/lib/` is a good example.

**Theme.** All apps share a dark theme: `--bg-primary: #0d1117`, `--bg-card: #161b22`, `--border: #30363d`, `--accent: #00bcd4`, `--text-main: #c9d1d9`, `--text-muted: #8b949e`.

## Create a new app

A new app has to be registered in several places so the launcher, icons, installers and knowledge graph know about it. The `create-robos-app` skill does all of it. With Claude Code:

```
/create-robos-app <app-id> <one-line description>
```

Other agents read the same skill from `.agents/skills/` or `plugins/robos/skills/`. To do it by hand:

1. `packages/<app-id>/`, the app itself, with its `<app-id>.desktop` launcher entry
2. `packages/desktop-manager/main.js`: `APP_REGISTRY` and `APP_BINS`
3. `packages/robos-icons/builtin-apps.js`: `BUILTIN_APPS` (alphabetical)
4. `packages/robos-icons/builtin-apps-browser.js`: `ROBOS_BUILTIN_APPS`
5. The App Suite table in `AGENTS.md`
6. The app's node in `.robos/kgraphs/` plus `.robos/kgraph.yaml` and `.robos/packages.yaml`
7. A debug port in `PORT_REGISTRY` in `packages/robos-lib/snapshot-cli.js`, and in `PORT_MAP` in `packages/robos-test/lib/harness.js` if it has shared E2E tests

Then run `node scripts/sync-app-docs.js` to generate its page in `docs/_apps/`. The checklist in [AGENTS.md](AGENTS.md) also names a few registries that only exist on some setups.

Renaming or removing an app touches the same list. Use `rename-robos-app` and `remove-robos-app`.

For a public web app (Next.js on Vercel) start from `packages/app-wizard/templates/nextjs-vercel-web` via `packages/app-wizard/lib/generate-app.js`. The section "Web App Launch Kit" in [AGENTS.md](AGENTS.md) lists what that template must keep in place.

## Change an existing app

1. Branch from `main`.
2. Launch the app with `scripts/dev-launch.sh <app-id>` and find the code: UI in `renderer/`, IPC in `main.js` and `preload.js`, logic in `lib/`.
3. Make the change. If it adds or changes something the app *is* (a screen, an entity, an API, a test), update the app's node in the knowledge graph too (see [The knowledge graph](#the-knowledge-graph)).
4. Add or update tests, run them (see [Testing](#testing)).
5. Commit with a [Conventional Commit](https://www.conventionalcommits.org/) message scoped to the package, for example `fix(point-of-sale): round tax per line`.

The planning and review apps in this repo (`task-planner`, `task-implementer`, `pr-review`) run the same loop with an agent doing the implementation. You don't need them to contribute; a normal branch and pull request works.

## Shared libraries

| Package | What it gives you |
|---|---|
| `robos-lib/ai-agent.js` | `ask(prompt, opts)`: one call that runs the user's active agent CLI (or the opt-in API mode), with the prompt security guard applied |
| `robos-lib/agent-selector.js` | `<robos-agent-selector>`, the shared agent picker |
| `robos-lib/ai-json.js` | `parseAIJson` and `JSON_RULES_PROMPT` for streaming and repairing JSON from agents |
| `robos-lib/dom-snapshot.js` | Debug server used by the snapshot CLI and tests |
| `robos-lib/config-sync.js` | Back up and share `~/.config/robos` |
| `robos-icons/` | SVG icon registry and the built-in app list |
| `robos-ui/` | Shared UI components |
| `robos-mcp-lib/` | Helpers for the `*-mcp` packages (MCP servers for the graph, IDE bridge, tasks, workspaces) |

On the VM these are installed under `/usr/local/share/robos/` and required by absolute path. Outside the VM that path does not exist, so always load shared code with a fallback:

```js
let aiAgent = null;
for (const p of [
  path.resolve(__dirname, '..', 'robos-lib', 'ai-agent'),
  '/usr/local/share/robos/robos-lib/ai-agent',
]) {
  try { aiAgent = require(p); break; } catch {}
}
```

## Adding an AI feature

AI in an app is always an optional extra. The app must work fully with no agent configured.

- Put the feature behind an explicit action: a `<robos-ai-textarea>` with an adjacent `✦` button that starts disabled. The `add-ai-text-area-to-app` skill wires this up.
- Let the user pick the agent with `<robos-agent-selector>`.
- Send one-shot requests through `robos-lib/ai-agent` `ask()`, never by calling a CLI or API yourself. That is where the prompt security guard (secret, PII and prompt-injection scanning) runs.
- Ground the prompt in the app's own data and its KGraph slice, not generic text.
- Never depend on the opt-in API mode (`robos-llm`); it is off by default.
- In tests, don't call a real agent. Inject the expected result instead.

The Audio Player's AI Playlists and Virtual DJ (`packages/audio-player/`) are the reference implementation.

## Testing

**Unit tests** need no display:

```bash
cd packages/robos-test && npm install && npm run test:unit
```

**End-to-end tests** launch real Electron apps and drive them over a debug port. Run them in the container, which provides a virtual display:

```bash
./scripts/e2e-container.sh
```

```bash
./scripts/e2e-container.sh --build
```

```bash
./scripts/e2e-container.sh node packages/robos-test/tests/dev-central/e2e.test.js
```

`--build` rebuilds the image first; passing a command runs just that test; `--interactive` drops you into a shell in the container.

Shared tests live in `packages/robos-test/tests/<app-id>/` and use the harness in `packages/robos-test/lib/` (`harness.js` to launch and kill apps, `snapshot.js` to read the DOM, `scenarios.js` for preset app state). Some apps also keep their own tests in `packages/<app-id>/tests/`, run with that package's `npm test` and `npm run test:e2e`.

Rules that keep tests reliable:

- Use only selectors that exist in the app's `renderer/` files. Grep for them before writing an assertion.
- Mock AI and network results; don't call the real endpoint.
- Avoid long sleeps; wait for text or state instead.

The `create-test` skill generates a test that follows these rules. `e2e-driven-dev` writes the E2E test first and records a narrated walkthrough when it passes; recordings are saved under `~/.robos/development/walkthroughs/<slug>/`.

## Debugging a running app

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

The `read-error-logs` skill collects Electron and RobOS failure logs.

## The knowledge graph

The KGraph describes the apps, services, contracts, databases, teams and work items in JSON-LD, validated with SHACL shapes.

- `.robos/kgraph.yaml` indexes the packages.
- `.robos/kgraphs/<package>/package.jsonld` holds each package's nodes (`applications`, `core-platform`, `services`, `devops`, `testing` and others).
- `.robos/knowledge-graph.jsonld` is the aggregate of all packages.

After editing a package file by hand, regenerate the aggregate. Apps that read the graph fail on startup if the two disagree, and a unit test checks it in CI:

```bash
node packages/crpg-builder/scripts/sync-aggregate.js
```

The `kgraph` CLI is in `packages/robos-graph/`:

```bash
node packages/robos-graph/bin/kgraph-cli.js --help
```

```bash
node packages/robos-graph/bin/kgraph-cli.js search "point of sale"
```

```bash
node packages/robos-graph/bin/kgraph-cli.js impact <node-id> --depth 3
```

```bash
node packages/robos-graph/bin/kgraph-cli.js validate
```

`insert` and `update` run SHACL validation before writing. `propose` and `apply` give a two-step reviewed change for imports and bulk edits. Never put secrets in the graph; credentials are stored in `pass` and referenced by path.

To model another repository in its own graph workspace, see [WORKSPACES.md](packages/robos-graph/WORKSPACES.md). The graph standards (OSLC, JSON-LD, SHACL, C4, Backstage, OpenAPI/AsyncAPI, TypeSpec, Pact) are covered in [AGENTS.md](AGENTS.md).

## Working with coding agents

[AGENTS.md](AGENTS.md) is the reference for agents and contributors: architecture, conventions, the registration checklist and known gotchas. `CLAUDE.md`, `GEMINI.md` and `ANTIGRAVITY.md` point to it.

Skills are written once in `plugins/robos/skills/` and installed in the form each agent reads:

```bash
claude plugin marketplace add ./plugins
```

```bash
claude plugin install robos
```

```bash
./plugins/install.sh
```

```bash
./plugins/install.sh --target codex
```

`install.sh` syncs skills into this repository for every supported agent; add `--global` to install into your user profile instead. Use the `manage-robos-skill` skill to add or change a skill.

Skills you will use most when building:

| Skill | Use it to |
|---|---|
| `create-robos-app`, `rename-robos-app`, `remove-robos-app` | Add, rename or remove an app across every registry |
| `create-test` | Write a test with verified selectors |
| `e2e-driven-dev`, `record-demo` | Drive work from an E2E test and record a walkthrough |
| `test-container` | Run the containerized E2E suite |
| `app-snapshot`, `read-error-logs` | Inspect a running app and its failures |
| `add-ai-text-area-to-app` | Add an optional AI action to an app |
| `kgraph-query`, `kgraph-insert`, `kgraph-update`, `kgraph-validate`, `kgraph-diff`, `kgraph-impact-analysis` | Read and change the knowledge graph |
| `update-app-icon` | Replace an app's icon |

The full list, with parameters, is in the [skills catalog](docs/skills/skills-catalog.md) and [plugins/README.md](plugins/README.md).

## Docs and site

- `docs/` is the documentation site and `site/` is the front site, both Jekyll.
- `scripts/build-docs.sh` builds both the way CI does (needs Jekyll and the gems in `docs/Gemfile`).
- `node scripts/sync-app-docs.js` regenerates the per-app pages in `docs/_apps/`.
- Don't write counts of things that grow ("the app suite", not "30+ apps"); they go stale.

## The VM image

The optional appliance is an Ubuntu desktop image for QEMU/KVM with every app preinstalled. Build and run it from `infra/desktop/`:

```bash
infra/desktop/build.sh
```

```bash
infra/desktop/run.sh
```

```bash
infra/desktop/clean.sh
```

The `build-vm`, `start-vm`, `stop-vm`, `vm-status`, `vm-ssh` and `deploy-to-vm` skills wrap these. When deploying packages into the VM by hand, run `sudo chmod -R a+rX` on `/usr/local/share/robos/` afterwards, and reinstall `node_modules` there, because copying dereferences the Electron symlinks.

## Conventions

- **Commits:** [Conventional Commits](https://www.conventionalcommits.org/) (`feat:`, `fix:`, `docs:`, `refactor:`, `test:`, `chore:`), scoped to the package.
- **No root `package.json`.** Each package installs its own dependencies.
- **IPC only** through `contextBridge` and `ipcRenderer.invoke()` / `ipcMain.handle()`. Never `nodeIntegration: true`.
- **Data** in `~/.config/robos/`.
- **Logging** with `pino` (JSON).
- **Icons:** 48×48 SVG, Lucide style, `stroke="#00bcd4"`, `stroke-width="1.5"`, round caps and joins.
- **Shared-lib requires** wrapped in `try/catch` with a local fallback.
- **AI is optional** in every app (see [Adding an AI feature](#adding-an-ai-feature)).

More rules and gotchas are in [AGENTS.md](AGENTS.md).

## Contributing

Read [CONTRIBUTING.md](CONTRIBUTING.md) first. Keep each pull request to one change, include test output, and for visible changes link a recorded walkthrough. If you touched `.robos/kgraphs/`, include the `kgraph-diff` result.

Feature ideas go in [`docs/ideas/`](docs/ideas/) and reported problems in [`docs/issues/`](docs/issues/). Questions and proposals go to [GitHub Discussions](https://github.com/nddipiazza/robos/discussions), bugs to [Issues](https://github.com/nddipiazza/robos/issues), and conversation to [Discord](https://discord.gg/6PjxzkHujE).

## License

Apache License 2.0. See [LICENSE](LICENSE).
