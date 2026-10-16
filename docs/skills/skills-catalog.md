---
title: Skills catalog
layout: default
parent: Skills
grand_parent: Build on RobOS
nav_order: 1
---

# Skills catalog
{: .no_toc }

Every agent skill in `plugins/robos/skills/`, with what it does and how to invoke it. Read this when you want to know which RobOS tasks an agent can already do from a single command.
{: .fs-6 }

<details open markdown="block">
  <summary>On this page</summary>
  {: .text-delta }
1. TOC
{:toc}
</details>

## How to read this catalog

Each skill is a directory with a `SKILL.md`. The descriptions below paraphrase the `description` line in that file. For the file format, see [Skills]({{ site.baseurl }}{% link robos-skills.md %}).

The Invoke column shows one of two things:

- A slash command, such as `/start-vm --headless`. These skills have a file in `plugins/robos/commands/`, and `./plugins/install.sh` copies it to `.claude/commands/`, `.antigravity/commands/` and `.gemini/commands/`. Arguments come from the skill's `Input` section.
- "No command file". These skills have no slash command. Ask your agent for the task and name the skill, or run the CLI shown in the row.

These are agent skills. The shell commands in the Skills Manager app are a separate list and are on the [Skills Manager Desktop App]({{ site.baseurl }}{% link skills/skills-manager.md %}) page.

## App development

| Skill | What it does | Invoke |
| --- | --- | --- |
| `create-robos-app` | Creates and scaffolds a new Electron desktop app, with its registrations and deployment | `/create-robos-app <app name>` |
| `rename-robos-app` | Renames an app: package directory, desktop entry, icon registry and docs | `/rename-robos-app <old-name> <new-name>` |
| `remove-robos-app` | Removes an app and deregisters it from manifests, icons and configuration | `/remove-robos-app <app-id or name>` |
| `update-app-icon` | Replaces or creates the 48x48 Lucide-style SVG icon and syncs it to the icon registries | `/update-app-icon <app-id or name> [icon description]` |
| `add-ai-text-area-to-app` | Adds the `<robos-ai-textarea>` widget (auto-resize, streaming, `@` file typeahead) to an app | `/add-ai-text-area-to-app` |
| `create-test` | Generates E2E and unit tests for an app with the `robos-test` framework | `/create-test <app-id> <what to test>` |
| `create-feature-spec` | Converts a raw idea or prompt into a feature specification in `docs/ideas/specs/` | `/create-feature-spec <idea text or path under docs/ideas/inbox/>` |
| `install-desktop-app` | Installs and registers a `.desktop` entry and icon on GNOME Linux, with optional desktop shortcut and dock favorite | `/install-desktop-app --app-id <id> --name <name> --exec <command>` |
| `crpg-game-builder` | Builds, validates and maintains party-based isometric cRPGs in Godot 4 from the knowledge graph | No command file |

## Knowledge graph

The ten `kgraph-*` skills wrap the `kgraph` command-line tool. In this table, `kgraph` means `node packages/robos-graph/bin/kgraph-cli.js`. Pass `--graph-root <workspace>` (or set `ROBOS_GRAPH_ROOT`) to work on an explicit graph workspace. None of these skills has a command file.

| Skill | What it does | CLI |
| --- | --- | --- |
| `kgraph-search` | Searches nodes across all packages by text, RDF type, owner team or tags | `kgraph search "<query>" [--type <type>] [--package <pkg>] [--team <team>] [--json]` |
| `kgraph-insert` | Adds a node to a package store, gated by shape validation | `kgraph insert --file <path>`, or `--id`, `--type`, `--title`, `--package` |
| `kgraph-update` | Changes properties, contracts, dependencies or tags on a node and revalidates it | `kgraph update <node-id> --set <key=value>` or `--file <path>` |
| `kgraph-delete` | Removes a node, optionally pruning references to it | `kgraph delete <node-id> [--cascade]` |
| `kgraph-query` | Queries nodes by type, package or dependency, or traces a path between two nodes | `kgraph query --type <type>`, or `--path-from <id> --path-to <id>` |
| `kgraph-impact-analysis` | Traces upstream and downstream dependencies before you change a service, database or contract | `kgraph impact <node-id> [--depth <n>]` |
| `kgraph-validate` | Validates nodes against the supported built-in shape constraints | `kgraph validate [package] [--strict] [--json]` |
| `kgraph-diff` | Compares the production `main` graph with a feature branch or working tree | `kgraph diff [branch] [--base <branch>]` |
| `kgraph-export` | Exports the graph or one package as JSON-LD, Turtle or N-Triples | `kgraph export --format <jsonld\|ttl\|nt> [--package <pkg>] [--output <file>]` |
| `kgraph-visualize` | Generates Mermaid or C4 diagrams for a node, package or squad | `kgraph visualize [id-or-package] [--direction <TD\|LR>] [--output <file>]` |

`kgraph-validate` checks supported structure, references and built-in cardinality rules. Its `SKILL.md` says a passing report is a structural check, not proof that the graph matches the source code.

Other skills that read or write the graph:

| Skill | What it does | Invoke |
| --- | --- | --- |
| `import-company-kgraph` | Extracts an evidence-backed graph from local Git checkouts into a reviewable proposal. See [Import company knowledge graph]({{ site.baseurl }}{% link skills/import-company-kgraph.md %}) | `/import-company-kgraph` with `--manifest`, `--paths`, `--graph-root`, `--output` |
| `sync-kgraph-docs` | Inspects graph changes under `.robos/`, decides what documentation they affect and updates it | No command file |
| `schema-lookup` | Queries Schema.org and OSLC vocabularies, shows type lineage, validates JSON-LD and synthesizes graph shapes | No command file. `node plugins/robos/skills/schema-lookup/scripts/schema-query.js <search\|type\|property\|validate\|synthesize> ...` |
| `generate-app-docs` | Writes a Markdown architecture page and a Mermaid flow diagram for an app from its graph node, and links them to the documentation package | No command file |
| `generate-app-elearning` | Builds an eLearning course for an app from its graph node, scaffolds a standalone Electron player and records completion certificates | No command file |

## Project plans

These skills read and write saved project plans in a graph workspace. Set `ROBOS_GRAPH_ROOT` to a directory that contains `.robos`. The view, update and remove skills also expect `ROBOS_SOURCE_ROOT`, the absolute path of the RobOS checkout whose CLI you run. The plan format and the headless commands are in `packages/task-planner/PROJECT-PLANS.md`. The matching UI is the Task Planner app; see its [app page]({{ '/apps/task-planner/' | relative_url }}).

| Skill | What it does | Invoke |
| --- | --- | --- |
| `plan-before-implement` | Creates a reviewed project plan with linked GitHub features and tasks before implementation, and views saved plans by task number or URL | `/plan-before-implement` |
| `view-task-plan` | Shows or lists saved plans by task number, GitHub issue URL or plan id, without changing data | `/view-task-plan` |
| `update-project-plan` | Edits, refreshes or restores a saved plan through a reviewed graph proposal, keeping work-item identities | `/update-project-plan` |
| `remove-project-plan` | Removes one saved plan through a reviewed proposal. The project, tasks, relationships and GitHub issues remain | `/remove-project-plan` |

## Testing, demos and proof of work

| Skill | What it does | Invoke |
| --- | --- | --- |
| `e2e-driven-dev` | Develops a task test-first: writes a text-narrated E2E test, records video with on-screen narration and WebVTT captions, runs on localhost in Docker or Xvfb | `/e2e-driven-dev <app-id> "<task>"`, or `/do-e2e-driven-dev` |
| `record-demo` | Records a text-narrated walkthrough video of an app on localhost with on-screen narration and WebVTT captions | `/record-demo <app-id> [what to demonstrate]` |
| `test-container` | Runs RobOS apps in a Docker container with Xvfb and a compositor; runs `./scripts/e2e-container.sh` | `/test-container [--build] [-i] [test file]` |
| `app-snapshot` | Captures a DOM snapshot (text, JSON or screenshot) from a running app, without VNC | `/app-snapshot <app-id> [--json\|--screenshot]` |

For how recorded demos are used in review, see [Walkthroughs and proof of work]({{ site.baseurl }}{% link walkthroughs.md %}).

## Virtual machine and desktop

The VM skills drive the QEMU/KVM image built from `infra/desktop/`. They need QEMU and KVM on the host; `install-dev-deps` below installs them.

| Skill | What it does | Invoke |
| --- | --- | --- |
| `build-vm` | Builds the RobOS QEMU/KVM disk image and the cloud-init provisioning ISO from scratch | `/build-vm` |
| `start-vm` | Starts the VM; GTK display by default | `/start-vm [--firstboot] [--vnc] [--spice] [--headless]` |
| `stop-vm` | Shuts the VM down gracefully, or terminates it | `/stop-vm` |
| `vm-status` | Reports whether the VM runs, SSH reachability, memory, disk, display and installed apps | `/vm-status` |
| `vm-ssh` | Runs a shell command in the VM over SSH on port 2224 | `/vm-ssh <command>` |
| `deploy-to-vm` | Copies one or more packages from the repository to the running VM | `/deploy-to-vm <package...>` or `/deploy-to-vm all` |
| `add-install-step` | Adds a step to the cloud-init provisioning sequence and the ASCII boot splash | `/add-install-step <step name>` |
| `restart-taskbar` | Restarts the `robos-desktop` taskbar and the `desktop-manager` service in the VM or locally | `/restart-taskbar` |

## Agents, review and integrations

| Skill | What it does | Invoke |
| --- | --- | --- |
| `pr-review-theater` | Inspects and orchestrates PR Review Theater: training knowledge checks, living documentation, in-app diffs and IDE branch comparisons. See [PR Review Theater]({{ site.baseurl }}{% link pr-review-theater.md %}) | No command file |
| `manage-agent-personas` | Adds, customizes and inspects developer agent personas and their execution modes | `/manage-agent-personas <list\|show\|add\|customize\|reset> ...` |
| `ide-java` | Automates Java work in IntelliJ IDEA over the port 63343 bridge: run and debug configurations with secrets from `pass`, breakpoints, paused-thread inspection | `/ide-java <subcommand> ...` |
| `robos-voice` | Speaks to the user through RobOS Voice, checks voice status and sends queries to the desktop assistant | `/robos-voice <speak\|stop\|voices\|assistant\|background\|status> ...` |
| `robos-github-auth` | Rules for code that touches GitHub issues or PRs: use the RobOS task servers and the selected Git client account, never a bare `gh` call | `/robos-github-auth` |

## Setup and housekeeping

| Skill | What it does | Invoke |
| --- | --- | --- |
| `install-dev-deps` | Audits and installs host dependencies: QEMU/KVM, Electron libraries, Java and Gradle, Node.js packages. Runs `scripts/install-dev-deps.sh` | `/install-dev-deps [--check] [--sys] [--npm]` |
| `read-error-logs` | Reads RobOS application failure logs, uncaught exceptions and Electron error-dialog events | `/read-error-logs [--app <app-id>] [--limit <n>]` |
| `report-issue` | Turns a raw bug report into an issue spec in `docs/issues/reported/` | `/report-issue <bug text or inbox file>` |
| `manage-robos-skill` | Adds, updates, removes or lists skills and syncs them across agent directories | `/manage-robos-skill <add\|update\|remove\|list> ...` |
