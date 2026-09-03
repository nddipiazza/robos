# RobOS Plugin Marketplace & AI Agent Skills

Welcome to the **RobOS Plugin Marketplace**, the standardized AI plugin and skill repository for the RobOS ecosystem.

This marketplace packages all RobOS development lifecycle tools, virtual machine management commands, Electron scaffolding workflows, DOM snapshot visual inspection tools, and testing utilities into standardized AI agent skills compatible across **Claude Code**, **OpenAI Codex**, **Google Antigravity**, **GitHub Copilot**, and **Gemini CLI**.

---

## Quick Start: Single-Command Installation

To install or synchronize all RobOS skills to your project or user environment, run the installer:

```bash
# Sync all skills and commands for all agents in this repo
./plugins/install.sh

# Install globally to your user profile (~/.claude, ~/.agents, ~/.antigravity)
./plugins/install.sh --global

# Install for a specific AI agent platform
./plugins/install.sh --target claude
./plugins/install.sh --target codex
./plugins/install.sh --target antigravity
./plugins/install.sh --target copilot
./plugins/install.sh --target gemini
```

---

## Agent Platform Setup Guide

### 1. Claude Code

#### Option A: Marketplace Plugin (Recommended)
Add the RobOS plugin marketplace to your Claude Code configuration:

```bash
claude plugin marketplace add ./plugins
claude plugin install robos
```

Or copy/link globally:
```bash
./plugins/install.sh --target claude --global
```

#### Option B: Repository Slash Commands
Running `./plugins/install.sh --target claude` populates `.claude/commands/`, enabling all slash commands (e.g. `/create-robos-app`, `/start-vm`, `/app-snapshot`, `/test-container`) directly in your Claude Code CLI sessions.

---

### 2. OpenAI Codex / ChatGPT CLI

OpenAI Codex and compatible coding agents discover skills via the standard `.agents/skills/` directory and `AGENTS.md`.

To enable:
```bash
./plugins/install.sh --target codex
```

This installs all skills with standard `SKILL.md` manifests under `.agents/skills/<skill-name>/SKILL.md`.

---

### 3. Google Antigravity

Antigravity natively loads skills from `.antigravity/commands/` and `.agents/skills/`.

To enable:
```bash
./plugins/install.sh --target antigravity
```

You can now use commands like `/create-robos-app`, `/deploy-to-vm`, `/test-container`, and invoke skills by name.

---

### 4. GitHub Copilot

GitHub Copilot accesses instructions via `AGENTS.md` and repository skills located in `.github/skills/`.

To enable:
```bash
./plugins/install.sh --target copilot
```

---

### 5. Gemini CLI

Gemini CLI loads slash commands and instructions from `.gemini/commands/` and `AGENTS.md`.

To enable:
```bash
./plugins/install.sh --target gemini
```

---

## Marketplace & Plugin Architecture

```
plugins/
├── README.md                      # Marketplace documentation (this file)
├── install.sh                     # Multi-agent installer and sync script
├── marketplace.json               # Universal marketplace registry manifest
└── robos/                         # The core RobOS developer plugin
    ├── README.md                  # Plugin documentation
    ├── plugin.json                # Standardized plugin manifest
    ├── codex-plugin.json          # OpenAI Codex manifest
    ├── antigravity-plugin.json    # Google Antigravity manifest
    ├── copilot-plugin.json        # GitHub Copilot manifest
    ├── .claude-plugin/
    │   └── plugin.json            # Claude Code native manifest
    ├── commands/                  # Slash command definitions (23 commands)
    └── skills/                    # Universal Agent Skills (23 skills)
        ├── add-ai-text-area-to-app/SKILL.md
        ├── add-install-step/SKILL.md
        ├── app-snapshot/SKILL.md
        ├── build-vm/SKILL.md
        ├── create-feature-spec/SKILL.md
        ├── create-robos-app/SKILL.md
        ├── create-test/SKILL.md
        ├── deploy-to-vm/SKILL.md
        ├── e2e-driven-dev/SKILL.md
        ├── install-dev-deps/SKILL.md
        ├── manage-robos-skill/SKILL.md
        ├── read-error-logs/SKILL.md
        ├── record-demo/SKILL.md
        ├── remove-robos-app/SKILL.md
        ├── rename-robos-app/SKILL.md
        ├── report-issue/SKILL.md
        ├── restart-taskbar/SKILL.md
        ├── start-vm/SKILL.md
        ├── stop-vm/SKILL.md
        ├── test-container/SKILL.md
        ├── update-app-icon/SKILL.md
        ├── vm-ssh/SKILL.md
        └── vm-status/SKILL.md
```

---

## Complete Skills Catalog

| Skill Name | Command | Description |
|------------|---------|-------------|
| **`add-ai-text-area-to-app`** | `/add-ai-text-area-to-app` | Embed `<robos-ai-textarea>` with streaming and `@mention` typeahead |
| **`add-install-step`** | `/add-install-step` | Add a step to cloud-init provisioning and ASCII splash screen |
| **`app-snapshot`** | `/app-snapshot` | Capture DOM text/JSON/screenshot snapshots from running apps |
| **`build-vm`** | `/build-vm` | Build QEMU VM disk image and cloud-init ISO |
| **`create-feature-spec`** | `/create-feature-spec` | Convert raw ideas into structured specifications in `docs/ideas/specs/` |
| **`create-robos-app`** | `/create-robos-app` | Scaffold a new Electron app with full registry and icon setup |
| **`create-test`** | `/create-test` | Generate unit/E2E tests using `robos-test` framework |
| **`deploy-to-vm`** | `/deploy-to-vm` | Deploy packages and apps to the running RobOS VM |
| **`e2e-driven-dev`** | `/e2e-driven-dev`, `/do-e2e-driven-dev` | Perform task development driven by narrated E2E tests and video generation |
| **`install-dev-deps`** | `/install-dev-deps` | Audit and install host dev dependencies (QEMU, Electron, Java, Node) |
| **`manage-robos-skill`** | `/manage-robos-skill` | Add, update, or remove a RobOS skill in the marketplace |
| **`read-error-logs`** | `/read-error-logs` | Inspect centralized RobOS error stream and system crashes |
| **`record-demo`** | `/record-demo` | Capture narrated video walkthrough with neural TTS (Piper) and WebVTT |
| **`remove-robos-app`** | `/remove-robos-app` | Safely remove an Electron app and deregister across manifests |
| **`rename-robos-app`** | `/rename-robos-app` | Rename an Electron app with all manifest/icon/desktop file updates |
| **`report-issue`** | `/report-issue` | Convert raw bug reports into structured issue specs in `docs/issues/` |
| **`restart-taskbar`** | `/restart-taskbar` | Restart `robos-desktop` taskbar dock and `desktop-manager` service |
| **`start-vm`** | `/start-vm` | Start QEMU virtual machine with GTK, VNC, SPICE, or headless mode |
| **`stop-vm`** | `/stop-vm` | Gracefully shut down or terminate the RobOS virtual machine |
| **`test-container`** | `/test-container` | Run headless containerized E2E tests in Docker + Xvfb |
| **`update-app-icon`** | `/update-app-icon` | Replace 48x48 Lucide SVG icon and sync to icon registries |
| **`vm-ssh`** | `/vm-ssh` | Execute shell commands on the RobOS VM via SSH (port 2224) |
| **`vm-status`** | `/vm-status` | Check VM running state, SSH connectivity, memory, and disk usage |

---

## Managing Skills with `manage-robos-skill`

Use the `manage-robos-skill` skill or slash command to maintain the marketplace:

### Adding a New Skill
```bash
/manage-robos-skill add <skill-name> "<description>"
```
This automatically scaffolds `plugins/robos/skills/<skill-name>/SKILL.md`, creates `plugins/robos/commands/<skill-name>.md`, registers it in `plugin.json`, and synchronizes across all agent directories.

### Updating a Skill
```bash
/manage-robos-skill update <skill-name>
```

### Removing a Skill
```bash
/manage-robos-skill remove <skill-name>
```
