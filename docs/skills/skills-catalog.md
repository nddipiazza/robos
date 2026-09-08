---
title: Complete Skills Catalog & Reference
layout: default
parent: RobOS Skills
nav_order: 1
---

# Complete Skills Catalog & Reference
{: .no_toc }

Comprehensive reference of all 34+ AI Agent Skills in the RobOS Plugin Marketplace and their execution parameters, companion engines, and verification methods.
{: .fs-6 .fw-300 }

## Table of contents
{: .no_toc .text-delta }

1. TOC
{:toc}

---

## 1. Knowledge Graph (KGraph) Skills Suite

The RobOS SDLC Knowledge Graph is the executable blueprint of your entire engineering system. This comprehensive skill suite allows AI agents and developers to search, query, insert, update, delete, validate, diff, export, visualize, and import graph components across all modular package stores (`.robos/kgraphs/`).

### `kgraph-search`
- **Slash Command**: `/kgraph-search <query>`
- **Companion CLI**: `node packages/robos-graph/bin/kgraph-cli.js search <query> [options]`
- **Arguments**:
  - `<query>`: Search string matching titles, descriptions, IDs, roles, or tags.
  - `--type <type>`: Filter by RDF/SHACL type (e.g. `robos:Microservice`, `robos:Database`, `robos:MCPServer`).
  - `--package <pkg>`: Filter by modular package (e.g. `services`, `applications`, `devops`, `core-platform`).
  - `--owner-team <teamId>`: Filter by owning engineering squad.
  - `--json`: Output raw JSON-LD node array.
- **Description**: Rapidly searches components, databases, contracts, pipelines, and agents across all modular package stores.

### `kgraph-insert`
- **Slash Command**: `/kgraph-insert <json-string-or-file>`
- **Companion CLI**: `node packages/robos-graph/bin/kgraph-cli.js insert [options]`
- **Arguments**:
  - `[json-string]`: Raw JSON-LD entity definition.
  - `--file <path>`: Path to a JSON or JSON-LD file containing the node.
  - `--id <id>`: Explicit URI (e.g. `urn:robos:service:billing-api`).
  - `--type <type>`: RDF type (e.g. `robos:Microservice`).
  - `--title <title>`: Human-readable entity title.
  - `--package <pkg>`: Target package (`services`, `applications`, `devops`, etc.).
  - `--no-validate`: Bypass SHACL validation gate (not recommended).
- **Description**: Registers a newly designed or synthesized component into the Knowledge Graph, automatically enforcing W3C SHACL shape validation before persistence.

### `kgraph-delete`
- **Slash Command**: `/kgraph-delete <node-id>`
- **Companion CLI**: `node packages/robos-graph/bin/kgraph-cli.js delete <node-id> [--cascade]`
- **Arguments**:
  - `<node-id>`: Target entity URI (e.g. `urn:robos:service:legacy-auth`).
  - `--cascade`: Automatically prune referencing edges from dependent nodes across all packages.
- **Description**: Safely decommissions an application, service, contract, or infrastructure node and cleans up relational edges without corrupting package JSON-LD manifests.

### `kgraph-update`
- **Slash Command**: `/kgraph-update <node-id> [json-patch]`
- **Companion CLI**: `node packages/robos-graph/bin/kgraph-cli.js update <node-id> [options]`
- **Arguments**:
  - `<node-id>`: Target entity URI to modify.
  - `[json-patch]`: JSON string with fields to update.
  - `--file <path>`: JSON file containing updated properties.
  - `--set <key=value>`: Direct property update (e.g. `--set robos:ownerTeam=urn:robos:team:platform`).
- **Description**: Modifies existing nodes in-place, updates package stores, and re-validates against SHACL constraints while logging living documentation impact advisories.

### `kgraph-query`
- **Slash Command**: `/kgraph-query [filters]`
- **Companion CLI**: `node packages/robos-graph/bin/kgraph-cli.js query [options]`
- **Arguments**:
  - `--type <type>`: Filter nodes by RDF type.
  - `--package <pkg>`: Filter by package store.
  - `--path-from <id> --path-to <id>`: BFS graph traversal tracing connection path between two entities across microservices and contracts.
  - `--search <text>`: Text substring match.
  - `--json`: Output raw query results.
- **Description**: Executes multi-criteria graph queries and traces reference paths across microservice boundaries.

### `kgraph-impact-analysis`
- **Slash Command**: `/kgraph-impact-analysis <node-id>`
- **Companion CLI**: `node packages/robos-graph/bin/kgraph-cli.js impact <node-id> [--depth <n>]`
- **Arguments**:
  - `<node-id>`: Focused entity URI (e.g. `urn:robos:service:auth-service`).
  - `--depth <n>`: Maximum hop traversal depth (default 3).
  - `--json`: Output structured blast radius report.
- **Description**: Recursively traverses inbound and outbound dependency edges to evaluate the blast radius before code edits, API schema mutations, or database migrations.

### `kgraph-validate`
- **Slash Command**: `/kgraph-validate [package-id]`
- **Companion CLI**: `node packages/robos-graph/bin/kgraph-cli.js validate [package-id]`
- **Arguments**:
  - `[package-id]`: Specific package (`services`, `devops`, etc.) or omit to validate all packages.
  - `--strict`: Treat warnings as fatal validation failures.
  - `--json`: Output full SHACL validation report.
- **Description**: Enforces 100% W3C SHACL shape conformance, verifying mandatory properties, valid URIs, and structural constraints across all nodes.

### `kgraph-diff`
- **Slash Command**: `/kgraph-diff [target-branch]`
- **Companion CLI**: `node packages/robos-graph/bin/kgraph-cli.js diff [target-branch] [--base main]`
- **Arguments**:
  - `[target-branch]`: Feature branch or working tree state (defaults to current feature branch).
  - `--base <branch>`: Base comparison branch (defaults to `main`).
- **Description**: Computes semantic blast radius diffs between World 1 (Production `main`) and World 2 (feature branch), identifying added, modified, or removed components and breaking changes.

### `kgraph-export`
- **Slash Command**: `/kgraph-export [--format <jsonld|ttl|nt>]`
- **Companion CLI**: `node packages/robos-graph/bin/kgraph-cli.js export [options]`
- **Arguments**:
  - `--format <jsonld|ttl|nt>`: Serialization format (JSON-LD 1.1, Turtle `.ttl`, or N-Triples).
  - `--package <pkg>`: Target package to export (or omit for entire aggregated graph).
  - `--output <file>`: Destination file path.
- **Description**: Exports the Knowledge Graph to industry-standard RDF formats for ingestion into external graph databases (Neo4j, Amazon Neptune, GraphDB) or semantic pipelines.

### `kgraph-visualize`
- **Slash Command**: `/kgraph-visualize [id-or-package]`
- **Companion CLI**: `node packages/robos-graph/bin/kgraph-cli.js visualize [id-or-package] [options]`
- **Arguments**:
  - `[id-or-package]`: Focused node URI or package name (e.g. `services`).
  - `--direction <TD|LR>`: Mermaid layout orientation (Top-Down or Left-to-Right).
  - `--max-nodes <n>`: Node limit (default 40).
  - `--output <file>`: Save Mermaid syntax to file.
- **Description**: Generates executable Mermaid diagram syntax or C4 component dependency visualizations for any subsystem or node in the graph.

### `import-company-kgraph` (Alias: `/kgraph-import`)
- **Slash Command**: `/import-company-kgraph`, `/kgraph-import`
- **Companion CLI**: `node plugins/robos/skills/import-company-kgraph/scripts/import-company-kgraph.js`
- **Arguments**:
  - `--source <path|url|s3-uri>`: Ingestion endpoint (HTTP REST API, AWS S3 bucket URI, local filesystem directory or manifest, or list of Git URLs).
  - `--source-type <auto|http|file|s3|git-list>`: Explicit ingestion parser.
  - `--company-name <name>`: Organization title (e.g. `"Acme Global"`).
  - `--company-slug <slug>`: Organization slug (e.g. `"acme"`).
  - `--output <file>`: Destination JSON-LD file path.
  - `--import-to-robos`: Merge generated nodes directly into `.robos/kgraphs/` package stores and register projects in `~/.config/robos/git-projects.json`.
  - `--dry-run`: Preview discovered entities without writing files.
- **Description**: Automatically ingests enterprise repositories from HTTP REST endpoints (Backstage `catalog-entities.json`), AWS S3 buckets, local directories, or Git URLs. Classifies components into 9 multi-app archetypes, synthesizes OpenAPI 3.1 contracts, and generates valid OSLC JSON-LD package files.
- **Documentation**: [Company KGraph Import Skill Guide]({{ site.baseurl }}{% link skills/import-company-kgraph.md %})

### `sync-kgraph-docs` (Alias: `/kgraph-sync-docs`)
- **Slash Command**: `/sync-kgraph-docs`, `/kgraph-sync-docs`
- **Description**: Monitors additions, updates, or removals in **Modular KGraph Packages** and `.robos/packages.yaml`. Automatically discerns impacts across system documentation, architecture diagrams, and API guides, and synchronizes documentation in lockstep.

---

## 2. Application Scaffolding & Component Lifecycle

### `create-robos-app`
- **Slash Command**: `/create-robos-app <App Name>`
- **Description**: Scaffolds a complete RobOS Electron desktop application. Automatically creates `packages/<app-id>/` (main.js, preload.js, renderer UI, package.json), Lucide vector SVG icon, DOM snapshot debugging port (`19100+`), `.desktop` launcher, and registers across all 10 system manifests.

### `create-feature-spec`
- **Slash Command**: `/create-feature-spec <Idea or Prompt>`
- **Description**: Converts raw feature ideas or prompt notes into a structured engineering specification under `docs/ideas/specs/` with user stories, C4 component diagrams, BDD Gherkin scenarios, and implementation plans.

### `create-test`
- **Slash Command**: `/create-test <Component>`
- **Description**: Generates automated unit and headless GUI integration test files using the native `robos-test` framework.

### `add-ai-text-area-to-app`
- **Slash Command**: `/add-ai-text-area-to-app <App ID>`
- **Description**: Integrates the streaming `<robos-ai-textarea>` web component into any RobOS application, enabling streaming LLM completions and `@`-mention typeahead for files, repos, and shell skills.

### `update-app-icon`
- **Slash Command**: `/update-app-icon <App ID> <SVG Path>`
- **Description**: Replaces and standardizes an application's Lucide-style vector SVG icon (48×48 cyan `#00bcd4`), syncing across `robos-icons`, `icon-lib`, and desktop launcher shortcuts.

### `rename-robos-app`
- **Slash Command**: `/rename-robos-app <Old ID> <New ID>`
- **Description**: Safely renames an existing Electron app, updating folder paths, process registries, icons, desktop files, and documentation references without breaking links.

### `remove-robos-app`
- **Slash Command**: `/remove-robos-app <App ID>`
- **Description**: Decommissions an Electron application and deregisters it cleanly across all 10 registration manifests.

---

## 3. Automated E2E Testing & Proof-of-Work

### `e2e-driven-dev` / `do-e2e-driven-dev`
- **Slash Command**: `/e2e-driven-dev`, `/do-e2e-driven-dev`
- **Description**: Guides end-to-end task development verified by text-narrated automated tests and synchronized video recordings.

### `record-demo`
- **Slash Command**: `/record-demo <Demo Script>`
- **Description**: Executes headless walkthroughs on Xvfb, synthesizing offline neural voiceovers via Piper TTS and generating 1080p MP4/WebM videos with WebVTT captions archived to `~/.robos/development/walkthroughs/`.

### `test-container`
- **Slash Command**: `/test-container [options]`
- **Description**: Runs headless containerized E2E test suites inside Docker with Xvfb virtual framebuffers and Picom compositors (`./scripts/e2e-container.sh`).

### `app-snapshot`
- **Slash Command**: `/app-snapshot <App ID> [--text|--json|--screenshot]`
- **Companion CLI**: `node packages/robos-lib/snapshot-cli.js <App ID> [options]`
- **Description**: Queries live DOM text, JSON element trees, or captures PNG screenshots from running Electron applications via snapshot debug ports (19100–19121).

---

## 4. Virtual Machine & OS Lifecycle

### `build-vm`
- **Slash Command**: `/build-vm`
- **Companion Script**: `infra/desktop/build.sh`
- **Description**: Builds the Ubuntu 26.04 LTS QEMU/KVM virtual disk image and cloud-init stateless provisioning ISO.

### `start-vm` / `stop-vm`
- **Slash Command**: `/start-vm [gtk|vnc|spice|headless]`, `/stop-vm`
- **Companion Scripts**: `infra/desktop/run.sh`, `infra/desktop/clean.sh`
- **Description**: Boots or shuts down the local developer virtual machine with full host CPU allocation, 16 GB RAM, forwarded SSH (port 2224), and VNC (port 5910).

### `vm-status` & `vm-ssh`
- **Slash Command**: `/vm-status`, `/vm-ssh "<Command>"`
- **Description**: Inspects hypervisor status, SSH connectivity, and executes remote commands inside the VM.

### `deploy-to-vm`
- **Slash Command**: `/deploy-to-vm [all|<Package>]`
- **Description**: Transfers local package builds via SCP to `/usr/local/share/robos/`, resets read-executable permissions (`chmod -R a+rX`), and rebuilds node modules.

### `add-install-step`
- **Slash Command**: `/add-install-step`
- **Description**: Extends cloud-init first-boot provisioning steps in `infra/desktop/cloud-init.yaml` and updates the ASCII terminal welcome splash screen.

### `restart-taskbar`
- **Slash Command**: `/restart-taskbar`
- **Description**: Signals the RobOS Desktop Manager socket (`/run/user/<uid>/robos-dm.sock`) to reload the GNOME panel and taskbar dock without closing active application windows.

---

## 5. System Diagnostics & Marketplace Management

### `install-dev-deps`
- **Slash Command**: `/install-dev-deps`
- **Companion Script**: `node scripts/install-dev-deps.js`
- **Description**: Audits host development machine dependencies (QEMU, KVM, Node.js 20+, Electron, JDK 17+, Piper TTS, FFmpeg) and prompts or installs missing packages.

### `read-error-logs`
- **Slash Command**: `/read-error-logs [n]`
- **Description**: Inspects centralized Pino JSON application logs and Electron crash streams for rapid root-cause diagnosis.

### `report-issue`
- **Slash Command**: `/report-issue <Title>`
- **Description**: Formats user reports or crash findings into standardized issue specifications under `docs/issues/reported/`.

### `manage-robos-skill`
- **Slash Command**: `/manage-robos-skill <add|update|remove|list>`
- **Description**: Manages skills in the plugin marketplace, scaffolding files and automatically syncing across `.claude/commands/`, `.agents/skills/`, `.antigravity/commands/`, `.gemini/commands/`, and `.github/skills/`.
