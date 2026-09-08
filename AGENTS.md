# AGENTS.md

This file provides guidance to AI coding agents (Claude Code, OpenAI Codex, Google Antigravity, GitHub Copilot, Gemini CLI, Cursor, etc.) when working with code in this repository.

# RobOS — AI-First Developer Operating System & Application Suite

RobOS is a developer-first operating system, 30+ native application suite, and IDE ecosystem that automates the entire Software Delivery Lifecycle (SDLC) using AI. From the moment you log in or launch an application, every surface is optimized for AI-assisted software development.

## Vision

Every developer interaction — picking up a ticket, understanding a bug, reviewing a fix, shipping code — is augmented by AI. RobOS eliminates context-switching overhead by deeply integrating task management, code intelligence, and AI agents into the OS and IDE layers.

## Major Components

### 1. RobOS Gnome — The Desktop OS

A purpose-built Ubuntu-based Linux desktop environment where every app, panel, and widget serves the SDLC.

**OS Stack:**
- Ubuntu 26.04 LTS base (QEMU/KVM virtual machine, cloud-init provisioned)
- GNOME desktop environment
- LightDM auto-login, Tilix terminal, zsh + oh-my-zsh
- Custom dark navy/cyan theme throughout

**Desktop Components:**
- **App Launcher** — searchable icon grid of all RobOS applications
- **Desktop Panels** — GNOME panel with RobOS app launchers and systray widgets
- **Custom Desktop Widgets** — sprint status, PR health, calendar, blocker radar
- **Background Tasks** — agent scheduler, toast daemon, clipboard sync, notification engine
- **Suite of Apps** — 30+ Electron apps covering the full SDLC (see App Suite below)

**VM Specs:**
- 16 GB RAM, all host CPUs, 100 GB sparse qcow2 disk
- SSH (port 2224), VNC (port 5910), SPICE (port 5932)
- Fully reproducible via cloud-init (stateless first-boot provisioning)

### 2. RobOS IDE & PR Review Integration

RobOS seamlessly integrates with existing developer IDEs (IntelliJ IDEA, VS Code):

**Autonomous Agent Execution & Breakpoint Debugging:**
- When an AI agent investigates a task or builds a feature, it provisions the workspace, checks out the branch, and implements changes.
- RobOS provides a breakpoint feature that allows agents to run a reproduction test and stop at a breakpoint for interactive debugging inspection when needed.

**Pull Request Review in the IDE:**
- The primary developer touchpoint in the workflow is the **PR Review Process**.
- From the **RobOS Agent Code Review Platform**, developers can **optionally open the project in their IDE** (IntelliJ IDEA or VS Code) using RobOS.
- Reviewing in the IDE provides all rich IDE context in tow: full AST/symbol navigation, type checking, local test execution, and native pull request tools (JetBrains Pull Request tool window or VS Code's `GitHub.vscode-pull-request-github` extension).
- Developers can review diffs, leave inline comments, step through code, and submit approvals with full project awareness.

**IDE Bridges & Plugins:**
- **IntelliJ IDEA Plugin**: Port 63343 IPC server integration, native Pull Request review tool window, breakpoint debugger, and workspace run configurations (`.idea/runConfigurations/` XML generation)
- **VS Code Pull Request Plugin**: Deep integration with `GitHub.vscode-pull-request-github` (`vscode://github.vscode-pull-request-github/open-pr`) for in-editor PR reviews, comments, and approvals
- Task server integration (Jira, GitHub Issues)
- AI context injection (MCP-powered)
- Workspace provisioning automation
- Agent session management within the IDE

## App Suite

All apps are Electron + vanilla JavaScript (no React/Vue/Angular framework overhead). They require `--no-sandbox --disable-gpu --disable-dev-shm-usage` flags in the QEMU VM.

### Core Apps (panel-visible)
| App | Purpose |
|-----|---------|
| **App Launcher** | Searchable grid of all installed RobOS apps |
| **Dev Central** | Daily dashboard: sprint board, PR health, calendar, AI standup, blocker radar |
| **Issue Manager** | GitHub Issues client with Kanban board, AI issue breakdown |
| **Git Projects** | Repo manager with AI dev-setup generation, Monaco editor, terminal/IDE runners |
| **Agents Manager** | Manage Copilot CLI / Gemini / Claude / AI agent sessions |

### Supporting Apps
| App | Purpose |
|-----|---------|
| **Software Center** | Install and manage IDEs, CLI tools, and cloud SDKs |
| **Workspace Manager** | Discover and open local workspaces in any IDE |
| **Lang Manager** | Language runtime management (Node, Python, Java, Go, Rust) |
| **Context Manager** | Curate AI context sources (files, URLs, repos, tickets) |
| **Tech Workbench** | Technical spike research with AI assistance |
| **Work Journal** | Git-backed developer journal with AI activity feed |
| **Group Manager** | Manage organizations, teams, enterprise directory sync (Okta, Azure AD SCIM, LDAP), company bootstrap, and Team Topologies |
| **App Wizard** | Greenfield application scaffolding and brownfield codebase ingestion wizard across 9 multi-app archetypes |
| **Pass Manager** | GUI for GPG-encrypted password store |
| **Workflow Studio** | Workflow and issue lifecycle management |
| **Agent Scheduler** | Background cron-based AI agent jobs |
| **Task Servers** | Jira / GitHub task server configuration |
| **Task Planner** | AI task plan generator and issue creator with 66+ template web forms and custom template builder |
| **Kube Studio** | Multi-cluster Kubernetes, Helm, ArgoCD GitOps, and Vercel infrastructure navigator |
| **REST API Client** | Git-backed REST API client, collection runner, and microservice verifier |
| **Data Sources** | Knowledge Graph data sources explorer, database schema inspector, and interactive query console |
| **Relational DB Manager** | DBeaver & DataGrip-inspired SQL database manager, schema explorer, and query console |
| **NoSQL DB Manager** | MongoDB Compass & RedisInsight-inspired NoSQL document and key-value store manager |
| **gRPC Client** | BloomRPC & Kreya-inspired Protobuf gRPC microservice testing client |
| **GraphQL Client** | GraphiQL & Altair-inspired GraphQL schema explorer, query editor, and variables runner |
| **MCP Manager** | Discover, configure, and test Model Context Protocol servers |
| **Agent Code Review Platform** | Autonomous AI pull request auditor, semantic diffs, security audits, and IDE review bridge (IntelliJ IDEA & VS Code PR plugins) |
| **Knowledge Graph Explorer** | Dual-state OSLC JSON-LD knowledge graph browser, SHACL validator, eLearning generator, and living documentation sync |
| **Remote Execution Studio** | REAPI v2 distributed build clusters, Bazel (`.bazelrc`), Buck2 (`.buckconfig`), and Buildbarn / NativeLink configuration manager |
| **Claude Console** | Enhanced Claude Code GUI |
| **File Explorer** | Dark-themed file browser |
| **Icon Manager** | Manage and customize RobOS app icons |
| **Notifications** | Notification history viewer |
| **Toast Daemon** | System-wide overlay toast notifications |
| **Security Setup** | First-run GPG + SSH key initialization |
| **Search Index** | File system indexer for @-search in AI textareas |
| **RobOS Preferences** | System-wide settings (credentials, AI model prefs) |

## Shared Libraries

Libraries are **NOT npm dependencies** — they are deployed to `/usr/local/share/robos/` on the VM and consumed via absolute path requires:
```js
const { registerSnapshotIPC, startDebugServer } = require('/usr/local/share/robos/robos-lib/dom-snapshot');
```
Always wrap these requires in try/catch for dev-harness compatibility (libs may not be installed locally).

- **robos-lib** — `.desktop` file parsing (`parseDesktopFile`, `loadRobOSApps`, `groupByCategory`), app categories, DOM snapshot debug server
- **robos-icons** — Icon registry: `BUILTIN_APPS` array, `getIcon()`, `getAllIcons()`. Format: `{ appId, label, category, iconSvg }`

## Development & Testing

### Prerequisites
- QEMU/KVM with `/dev/kvm` access
- Node.js 20+ and npm
- For IntelliJ plugin: JDK 17+ and Gradle

### Containerized Headless E2E Testing (Primary Feedback Mechanism)
Run isolated E2E tests in a Docker container with Xvfb virtual framebuffer and Picom/Mutter compositor:
```bash
./scripts/e2e-container.sh                        # Run full test suite in Docker
./scripts/e2e-container.sh --build                # Rebuild container image and run
./scripts/e2e-container.sh -i                      # Drop into interactive container shell
```

### Running Apps
Launch any application from the **RobOS App Launcher** (the searchable application grid in the panel/dock) or run it directly from the terminal via Electron:
```bash
electron packages/<app-id>
```

### Building & Resetting the VM
```bash
infra/desktop/clean.sh        # Stops VM & removes previous build artifacts
infra/desktop/build.sh        # Creates disk image + cloud-init ISO
infra/desktop/run.sh           # Starts VM (automatically detects first boot & attaches cloud-init ISO)
```

### Deploying to VM
```bash
# Full install
ssh -p 2224 robos@localhost 'bash -s' < packages/desktop-shell/install.sh

# Single app update
scp -P 2224 -r packages/<app-id>/* robos@localhost:/tmp/<app-id>/
ssh -p 2224 robos@localhost "sudo rm -rf /usr/local/share/robos/<app-id> && sudo cp -r /tmp/<app-id> /usr/local/share/robos/<app-id> && sudo chmod -R a+rX /usr/local/share/robos/<app-id> && cd /usr/local/share/robos/<app-id> && sudo rm -rf node_modules && sudo npm install --quiet"
```

VM credentials: `robos` / `robos` (SSH port 2224).

### DOM Snapshot Debugging
Each app has a unique debug port for DOM snapshots (defined in `packages/robos-lib/snapshot-cli.js`):
```bash
node packages/robos-lib/snapshot-cli.js <app-id> --text    # Text snapshot
node packages/robos-lib/snapshot-cli.js <app-id> --json    # JSON DOM tree
node packages/robos-lib/snapshot-cli.js <app-id> --screenshot  # PNG screenshot
```
Port range: 19100–19121 (e.g., app-launcher=19100, dev-central=19101). See `PORT_REGISTRY` in snapshot-cli.js.

## Plugin Marketplace & AI Agent Skills

RobOS includes a cross-agent plugin marketplace and standard skills under `plugins/robos/skills/` (and `.agents/skills/`).

### Available Skills
- `add-ai-text-area-to-app` — Add `<robos-ai-textarea>` widget to a RobOS app
- `add-install-step` — Add cloud-init provisioning steps
- `app-snapshot` — Capture DOM snapshot from a running app
- `build-vm` — Build QEMU disk image + cloud-init ISO
- `create-feature-spec` — Convert a raw idea note or prompt into a structured feature specification in `docs/ideas/specs/`
- `create-robos-app` — Create a new Electron app with full registration across all required files
- `create-test` — Create a test file using the robos-test framework
- `deploy-to-vm` — Deploy packages to running VM
- `e2e-driven-dev` — Execute task development using text-narrated E2E tests and video generation
- `import-company-kgraph` — Ingest company/organization repository catalogs from HTTP, FileSystem, AWS S3, or Git forges into RobOS Knowledge Graph package files
- `install-dev-deps` — Audit and install all dev machine dependencies for all RobOS components
- `kgraph-delete` — Safely remove an entity node from the Knowledge Graph with optional cascade reference pruning
- `kgraph-diff` — Semantic blast radius diff comparing World 1 (main) against World 2 (feature branch)
- `kgraph-export` — Export Knowledge Graph to standard RDF formats (JSON-LD 1.1, Turtle .ttl, N-Triples)
- `kgraph-impact-analysis` — Trace transitive blast radius and dependent nodes before code or schema changes
- `kgraph-insert` — Insert or register a new architectural node with W3C SHACL shape validation gate
- `kgraph-query` — Query Knowledge Graph nodes by RDF type or trace multi-hop connection paths between entities
- `kgraph-search` — Semantic search across all Modular KGraph Packages by text, type, or tags
- `kgraph-update` — Update properties on existing Knowledge Graph nodes with automatic SHACL re-validation
- `kgraph-validate` — Run full W3C SHACL shape validation across all Modular KGraph Packages
- `kgraph-visualize` — Generate executable Mermaid diagram syntax or C4 component dependency visualizations
- `manage-robos-skill` — Add, update, or remove a RobOS skill in the plugin marketplace
- `read-error-logs` — Inspect RobOS failure logs and Electron errors
- `record-demo` — Record text-narrated video walkthrough script
- `remove-robos-app` — Remove an app and deregister everywhere
- `rename-robos-app` — Rename an app with all registration updates
- `report-issue` — Convert raw issue reports or prompts into structured issue specifications in `docs/issues/reported/`
- `restart-taskbar` — Restart the `robos-desktop` taskbar dock and `desktop-manager`
- `start-vm`, `stop-vm`, `vm-status`, `vm-ssh` — VM lifecycle management
- `sync-kgraph-docs` — Inspect RobOS Knowledge Graph object updates, discern documentation impacts, and synchronize living docs
- `test-container` — Run containerized headless E2E tests in Docker + Xvfb
- `update-app-icon` — Update an app's SVG icon

See [plugins/README.md](plugins/README.md) for full installation and usage instructions across Claude, Codex, Antigravity, Copilot, and Gemini.

## Conventions

- **Commits**: Conventional Commits (`feat:`, `fix:`, `chore:`, `docs:`, `refactor:`)
- **No root package.json**: Each package has independent `node_modules`
- **IPC**: All Electron apps use `contextBridge` in `preload.js` + `ipcRenderer.invoke()` / `ipcMain.handle()` (never `nodeIntegration: true`)
- **Config storage**: All persistent data in `~/.config/robos/`
- **Icons**: 48×48 SVG, Lucide style, `stroke="#00bcd4"`, `stroke-width="1.5"`, `stroke-linecap="round"`, `stroke-linejoin="round"`
- **Logging**: `pino` JSON logging
- **Walkthrough Archives**: All text-narrated demo recordings, WebVTT captions, and step-by-step markdown summaries are automatically archived to `~/.robos/development/walkthroughs/<slug>/` (with timestamped historical snapshots under `history/<timestamp>/`).

### Knowledge Graph (KGraph), Multi-Package Architecture, Multi-Repo Dependencies & Living Docs Sync
RobOS maintains a modular, packaged Dual-State SDLC Knowledge Graph. Rather than storing the universe in a single monolithic file, the Knowledge Graph is organized into namespaced, multi-file packages under `.robos/kgraphs/<package-id>/package.jsonld` indexed by `.robos/kgraph.yaml` (while maintaining backwards-compatible aggregated synchronization to `.robos/knowledge-graph.jsonld`).

**Standard RobOS Packages & Namespaces**:
- **`core-platform`** (`robos.core`): System architecture, C4 topology, microservices, relational and NoSQL databases (`robos:Database`, `robos:NoSQLDatabase`), Kafka message brokers (`robos:MessageBroker`), Model Context Protocol servers (`robos:MCPServer`), AI context sources (`robos:ContextSource`), distributed build systems (`robos:RemoteExecutionCluster`, `robos:BuildSystem`), and prompt optimization strategies (`robos:PromptStrategy` [Caveman], `robos:PromptOptimizer` [DSPy]).
- **`organization`** (`robos.org`): Team Topologies, human architects, AI agent personas (`robos:AgentPersona`), Git project organizations (`robos:GitProjectOrganization`), Task servers (`robos:TaskServer`), and enterprise directory sync.
- **`services`** (`robos.services`): Microservices, OpenAPI 3.1 contracts, Protobuf gRPC stubs (`robos:ProtobufContract`), GraphQL schemas (`robos:GraphQLContract`), and BDD verification features.
- **`applications`** (`robos.apps`): Client applications, frontend SPAs, desktop apps, mobile apps, PC/mobile games, and CLI tools.
- **`devops`** (`robos.devops`): Connected cloud providers, Kubernetes clusters (`robos:KubernetesCluster`), environments (`robos:Environment`), GitOps deployments (`robos:GitOpsDeployment`), CI/CD pipelines (`robos:CICDPipeline`), container registries, OAuth apps, DNS domains, and secure GPG pass credentials.
- **`learning`** (`robos.learning`): Interactive developer eLearning courses, labs, and architectural knowledge modules.
- **`documentation`** (`robos.docs`): Living documentation pages (`robos:DocumentationPage`), visual flow diagrams (`robos:FlowDiagram`) with dual Mermaid text and AI illustrations, Architecture Decision Records (`robos:ArchitectureDecisionRecord` / `robos:ADR`), interactive guided walkthroughs (`robos:InteractiveWalkthrough`), and verified code snippets (`robos:CodeSnippet`).

**Universal Knowledge Graph Data Backing (All RobOS Apps)**:
All operational data across the 30+ RobOS desktop applications is backed by the SDLC Knowledge Graph (`SDLCKnowledgeGraphStore`). Applications maintain local fast mirrors in `~/.config/robos/` while ensuring that all datastores (`db-manager`, `nosql-manager`, `data-sources`), AI components (`mcp-manager`, `agents-manager`, `context-manager`), cloud infrastructure (`kube-studio`), and issue tracking (`task-servers`) are registered as validated nodes conforming to W3C SHACL shapes with zero plaintext secrets (all credentials strictly link to UNIX `pass` GPG URNs via `robos:hasCredential`).


**Hierarchical Agent Context & Agent Rules Inheritance (`robos:GitProjectOrganization`)**:
RobOS eliminates duplicate skills, prompt instructions, and `.cursorrules` files across repositories by organizing agent context into 5 hierarchical levels: Global/Workstation (`robos.core`), Company/Enterprise (`robos:Company`), Git Project Organization (`robos:GitProjectOrganization`), Team/Squad (`robos:Team`), and Repository/Component (`robos:Microservice`, `robos:FrontEndApp`). Git forge organizations (e.g. `https://github.com/apache`) track forge metadata (`robos:orgName`, `robos:forgeType`, `robos:hasRepository`), living documentation context (`robos:documentation`), and organization-wide agent rules (`robos:agentRules`). All AI agents working on any member repository automatically inherit and obey these organization-wide rules and architectural guidelines via `store.getEffectiveAgentRulesForRepository()` and `store.getEffectiveDocumentationForRepository()`.

**Multi-Repo Knowledge Graph Dependencies & Git-Tag Versioning**:
RobOS supports multi-repo knowledge graph composition. In addition to the local workspace repository (`local`), developers can register external GitHub/Git repositories with semantic versioning tied to Git tags (e.g. `v1.2.0`). External KGraph repositories are cloned and cached into `~/.robos/cache/kgraphs/<repo-id>@<git-tag>/` with on-demand synchronization.

**DevOps Account Integrations & GPG Password Store (`pass`)**:
RobOS provides interactive onboarding wizards across 7 categories (Source Control, Cloud Infrastructure, CI/CD & GitOps, Package & Artifact Registries, Containers & Virtualization, OAuth & Identity, Domains & DNS Providers) covering 25+ providers (GitHub, GitLab, Bitbucket, AWS, GCP, Azure, OpenShift, Jenkins, Artifactory, Docker, Podman, Kubernetes, VMware, Okta, GoDaddy).
- **Zero Plaintext Credentials in KGraph**: Sensitive API tokens, private keys, and passwords are never written to the Knowledge Graph.
- **GPG Password Store Integration**: Secrets are encrypted and saved directly into the local UNIX password store (`pass`) at `~/.password-store/devops/<category>/<provider>/<account-slug>/<key>.gpg`.
- **First-Class Reference Nodes**: The KGraph stores first-class `robos:PassCredential` reference nodes declaring the `robos:passPath`, linked to `robos:DevOpsIntegration` nodes via `robos:hasCredential`.

**Multi-App Archetypes**:
- **Microservices & Web APIs** (`robos:Microservice`): Backend services implementing OpenAPI 3.1 YAML, Protobuf gRPC, or GraphQL contracts.
- **Front End Applications** (`robos:FrontEndApp` / `schema:WebApplication`): Single-page and SSR web client applications (React, Vite, Next.js, Vue, Svelte) running in modern browsers.
- **Desktop Applications** (`robos:DesktopApp`): Workstation desktop programs (Electron, Qt, GTK, Tauri) running locally on developer or end-user machines.
- **PC Games** (`robos:PCGame` / `schema:VideoGame`): Interactive desktop video games (Unreal Engine 5, Unity 6, Godot, Bevy) targeting Windows, Linux, and macOS with DirectX 12 and Vulkan graphics.
- **Mobile Games** (`robos:MobileGame` / `schema:VideoGame` + `schema:MobileApplication`): Mobile video games (Unity, Unreal, Godot) targeting iOS and Android devices.
- **Console & CLI Tools** (`robos:ConsoleApp`): Command-line terminal utilities (Go Cobra, Rust Clap, Python Click, Node Commander) with subcommands and flag specifications.
- **Mobile Applications** (`robos:MobileApp`): iOS, Android, React Native, and Flutter mobile clients.
- **Data Pipelines & Workers** (`robos:DataPipeline`): Stream and batch processing jobs (Kafka Streams, Celery, Spark).
- **Libraries & SDKs** (`robos:Library`): Reusable client SDKs, common modules, and packages.

**Git Projects Auto-Synchronization**:
Every repository registered in RobOS Git Projects (`~/.config/robos/git-projects.json`) is automatically ingested into the Knowledge Graph upon addition and continuously updated on `git pull` on the `main` branch.

**Cardinal Rule for KGraph Updates & Documentation Sync**:
Whenever Knowledge Graph objects are updated (added, altered, or deleted), the AI must be prompted to discern any noticeable updates to system documentation and to update the documentation accordingly:
1. **Analyze Graph Deltas**: Inspect newly added or modified nodes (Microservices, Desktop Apps, Console Apps, Mobile Apps, Data Pipelines, Libraries, Contracts, Requirements, eLearning courses, Teams, Projects, DevOps Integrations).
2. **Discern Noticeable Documentation Impacts**: Check user-facing documentation (`docs/index.md`, `README.md`, `docs/project-plan/`, API specs, and feature specs) for any necessary updates reflecting the changed architecture or capabilities.
3. **Synchronize Living Docs**: Automatically apply the corresponding documentation updates so that documentation and the Knowledge Graph remain in continuous lockstep.

### CSS Theme Variables
All apps share a consistent dark theme:
- `--bg-primary: #0d1117` — main background
- `--bg-card: #161b22` — card/panel background
- `--accent: #00bcd4` — primary accent (cyan)

## App Registration Checklist

When adding, renaming, or removing an app, update ALL of these locations. Use the `create-robos-app`, `remove-robos-app`, or `rename-robos-app` skills which handle this automatically:

1. `packages/<app-id>/` — the app directory
2. `packages/desktop-manager/main.js` — `APP_REGISTRY` and `APP_BINS`
3. `packages/robos-icons/builtin-apps.js` — `BUILTIN_APPS` array (alphabetical)
4. `packages/robos-icons/builtin-apps-browser.js` — `ROBOS_BUILTIN_APPS` array
5. `packages/icon-lib/builtin-apps.js` — must match #3 exactly
6. `packages/task-manager/main.js` — `KNOWN_APPS` map
7. `packages/desktop-shell/install.sh` — install block
8. `<app-id>.desktop` file
9. `AGENTS.md` App Suite table
10. **Modular KGraph Packages** (`.robos/kgraphs/` & `.robos/kgraph.yaml`) and `.robos/packages.yaml` — Register or update the application node in the dual-state SDLC knowledge graph and GitOps tree, and prompt documentation synchronization.

**Note:** Some checklist targets (desktop-manager, icon-lib, task-manager, desktop-shell) may not exist yet. Only update files that exist.

## Technical Gotchas

- **Electron in QEMU**: `--disable-dev-shm-usage` is critical or renderer windows go blank
- **Deploy permissions**: After `sudo cp -r` to `/usr/local/share/robos/`, always `sudo chmod -R a+rX` or Electron can't read the files
- **Deploy symlinks**: `scp -r` dereferences symlinks (e.g. `node_modules/.bin/electron`). Always `sudo rm -rf node_modules && sudo npm install` after deploy to regenerate correct symlinks
- **cloud-init**: `write_files` does NOT create parent dirs — always `mkdir -p` in `runcmd`; only runs once per `instance-id`
- **Monaco editors**: Call `ed.layout()` when tab becomes visible (initializing while hidden renders at 0×0)
- **Shell vars in JS**: Escape `$(...)` and `${VAR}` in template literals to avoid JS interpolation
- **Process management in VM**: `pkill`/`killall` unavailable — use `kill <PID>` with explicit PIDs
- **IntelliJ plugin path (Linux)**: `~/.local/share/JetBrains/IdeaIC<Version>/robos/`
- **Shared lib requires**: Wrap `/usr/local/share/robos/robos-lib/...` requires in try/catch — they're unavailable outside the VM

## Source Projects

This repo consolidates work from:
- [`robos-gnome`](https://github.com/nddipiazza/robos-gnome) — VM infrastructure, desktop shell, cloud-init provisioning
- [`roboto-os`](https://github.com/nddipiazza/roboto-os) — Electron desktop applications, shared libraries
