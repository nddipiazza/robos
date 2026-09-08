---
title: Complete Skills Catalog & Reference
layout: default
parent: RobOS Skills
nav_order: 1
---

# Complete Skills Catalog & Reference
{: .no_toc }

Comprehensive reference of all 24+ AI Agent Skills in the RobOS Plugin Marketplace and their execution parameters, companion engines, and verification methods.
{: .fs-6 .fw-300 }

## Table of contents
{: .no_toc .text-delta }

1. TOC
{:toc}

---

## 1. Knowledge Graph & Architecture Ingestion

### `import-company-kgraph`
- **Slash Command**: `/import-company-kgraph`
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

### `sync-kgraph-docs`
- **Slash Command**: `/sync-kgraph-docs`
- **Description**: Monitors additions, updates, or removals in `.robos/knowledge-graph.jsonld` and `.robos/packages.yaml`. Automatically discerns impacts across system documentation, architecture diagrams, and API guides, and synchronizes documentation in lockstep.

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
