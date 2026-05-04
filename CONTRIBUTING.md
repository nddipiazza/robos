# Contributing to RobOS

First off — thank you for considering a contribution. RobOS is an ambitious project and every app, fix, and doc improvement moves it forward.

## Table of Contents

- [Getting Started](#getting-started)
- [Development Workflow](#development-workflow)
- [Creating a New App](#creating-a-new-app)
- [Commit Conventions](#commit-conventions)
- [Pull Request Process](#pull-request-process)
- [Good First Issues](#good-first-issues)
- [Community](#community)

---

## Getting Started

### Prerequisites

- **Node.js 20+** and npm
- **QEMU/KVM** (for VM testing — optional but recommended)
- **Electron** is pulled in per-package via npm install

### Clone and explore

```bash
git clone https://github.com/nddipiazza/robos.git
cd robos
```

The repo is a monorepo of independent packages — there is **no root `package.json`**. Each app in `packages/` is self-contained.

### Run an app locally (dev harness)

The easiest way to test an app without a VM:

```bash
cd packages/robos-test
npm install
node harness.js --list-apps        # see all apps
node harness.js --app dev-central  # run an app in a mocked environment
```

### Run tests

```bash
cd packages/robos-test
npm install
npm run test:unit   # 440+ unit tests
npm test            # full E2E suite (requires a display)
```

---

## Development Workflow

### Working on an existing app

1. Edit files in `packages/<app-id>/`
2. Test locally with the dev harness
3. (Optional) Deploy to a running VM:

```bash
scp -P 2224 -r packages/<app-id>/* robos@localhost:/tmp/<app-id>/
ssh -p 2224 robos@localhost "
  sudo rm -rf /usr/local/share/robos/<app-id> &&
  sudo cp -r /tmp/<app-id> /usr/local/share/robos/<app-id> &&
  sudo chmod -R a+rX /usr/local/share/robos/<app-id> &&
  cd /usr/local/share/robos/<app-id> && sudo npm install --quiet
"
```

### Key conventions

| Rule | Why |
|------|-----|
| `app.setPath('userData', path.join(os.homedir(), '.config', 'robos', 'electron', '<app-id>'))` before `requestSingleInstanceLock()` | Prevents port conflicts between apps |
| `contextBridge` + `ipcRenderer.invoke` only — never `nodeIntegration: true` | Security |
| All config in `~/.config/robos/` | Consistent across all apps |
| Wrap `/usr/local/share/robos/robos-lib/…` requires in try/catch | Library not present outside the VM |
| `--no-sandbox --disable-gpu --disable-dev-shm-usage` flags | Required for Electron in QEMU |

### Shared libraries

- **`robos-lib/ai-json.js`** — robust AI JSON parsing (`parseAIJson`, `JSON_RULES_PROMPT`)
- **`robos-lib/dom-snapshot.js`** — debug server for DOM snapshots
- **`robos-lib/ai-agent.js`** — unified AI agent invocation
- **`robos-icons/index.js`** — SVG icon registry

Load them like this (with fallback for local dev):

```js
let robosLib = null;
try {
  const paths = [
    path.resolve(__dirname, '..', 'robos-lib', 'ai-json'),
    '/usr/local/share/robos/robos-lib/ai-json',
  ];
  for (const p of paths) { try { robosLib = require(p); break; } catch {} }
} catch {}
```

### CSS theme variables

All apps share the same palette:

```css
--bg-primary: #0d1117;   /* main background */
--bg-card:    #161b22;   /* card/panel background */
--accent:     #00bcd4;   /* primary cyan accent */
```

---

## Creating a New App

Use the slash command (if using Claude Code):

```
/create-robos-app "My App Name"
```

Or manually:

1. Create `packages/<app-id>/` with `main.js`, `preload.js`, `renderer/`, `icon.svg`, `package.json`, `<app-id>.desktop`
2. Register in `packages/robos-icons/index.js` (alphabetical by `appId`)
3. Add a debug port to `packages/robos-lib/snapshot-cli.js`
4. Add the `.desktop` file to `/usr/share/applications/` on the VM

See [CLAUDE.md](CLAUDE.md) for the full app registration checklist.

### Icon style

48×48 SVG, Lucide style:
- `stroke-width="1.5"`, `stroke-linecap="round"`, `stroke-linejoin="round"`
- Pick a color from the palette: `#00bcd4` cyan, `#3b82f6` blue, `#22c55e` green, `#7c3aed` purple, `#f97316` orange, `#ef4444` red

---

## Commit Conventions

We use [Conventional Commits](https://www.conventionalcommits.org/):

| Prefix | Use for |
|--------|---------|
| `feat:` | New feature or app |
| `fix:` | Bug fix |
| `docs:` | Documentation only |
| `refactor:` | Code restructure, no behavior change |
| `chore:` | Build, deps, tooling |
| `test:` | Tests only |

Scope the commit when it touches a specific package:

```
feat(workflow-studio): add unsaved-changes confirmation dialog
fix(task-servers): prevent SingletonLock crash on multi-user systems
```

---

## Pull Request Process

1. **Fork** the repo and create a branch: `feat/my-feature` or `fix/issue-description`
2. **Test** your changes — run unit tests, and if you changed a specific app, run it in the dev harness
3. **Keep PRs focused** — one feature or fix per PR
4. **Describe what and why** in the PR description — screenshots or screen recordings are very welcome
5. **One approving review** is required before merge

For large changes (new apps, architectural changes), open an issue first to discuss the approach.

---

## Good First Issues

Look for issues tagged [`good first issue`](https://github.com/nddipiazza/robos/issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22) on GitHub. Great entry points:

- **Add a new Electron app** — pick something from the roadmap
- **Improve an existing app's UI** — dark theme polish, responsive layout
- **Expand test coverage** — add dev-harness scenarios for an untested app
- **Documentation** — improve the [docs site](https://nddipiazza.github.io/robos/) or add screenshots

---

## Community

- **GitHub Discussions** — questions, ideas, show-and-tell
- **GitHub Issues** — bugs and feature requests
- **[Model Problem](https://nddipiazza.github.io/robos/model-problem/)** — watch RobOS in action end-to-end

We're early-stage and very open to direction from contributors. If you have ideas about what RobOS should become, open a Discussion — we read everything.
