---
title: Windows startup audit
layout: default
nav_order: 90
---

# Windows startup audit — October 22, 2026

This audit covers every application in the native Windows install's `apps.json`, plus the Windows launcher. Each app runs as a real Electron process with an isolated home and browser profile. The checks require a rendered window with content, no uncaught renderer errors, and no failed local resources. They also capture a screenshot, window title, loaded scripts and process diagnostics. The runner returns a failing exit code when any app fails, and applies a timeout and process cleanup to each launch.

The initial pass found 11 failures among the 89 catalog applications. The native launcher is included in the final pass as an additional entry.

## Repairs

| Affected application | Failure | Repair |
|---|---|---|
| Agents Manager | Missing browser icon registry; attempted Python session lookup without a Codex database | Ship the generated registry and return an empty session list when no database exists |
| Context Manager | Missing browser icon registry | Generate it from the canonical RobOS icon registry and regenerate during installation |
| CI Monitor MCP | Unconfigured Buildkite connection raised an uncaught startup rejection | Render the configuration message as an empty state |
| cRPG Game Builder eLearning | Loaded a documentation file omitted from the Windows installation | Ship standalone course HTML generated from the canonical course |
| Desktop Manager | `await` inside a synchronous socket callback prevented parsing | Correct the async callback; use a Windows named pipe and visible Windows status window |
| Git Projects | Referenced a highlight.js browser bundle that the npm package does not supply | Build the browser bundle during installation and use an absolute Monaco resource base |
| REST Client | Referenced a shared stylesheet that does not exist | Remove the obsolete reference; retain the app's own complete stylesheet |
| Desktop Agents Manager (`robos-agentd`) | Unix socket path failed with `EACCES` | Use a Windows named pipe; update the agent-session client to match |
| Profile Manager (`robos-profiled`) | Unix socket path failed with `EACCES` | Use a user-scoped Windows named pipe |
| Setup Wizard (`robos-onboarding`) | Missing groups IPC handler; embedded Monaco worker resolved from the filesystem root | Register the group reader and correct the editor's resource base |
| Workspace Manager | Unix socket path failed with `EACCES`; response writes crashed with `EPIPE` | Use a named pipe, preserve the response side of half-closed connections, and handle disconnected clients |

Windows named pipes are derived from the user's home directory, so users have distinct endpoints. Unix socket paths retain their previous behavior. Desktop Manager uses the native launcher on Windows and leaves GNOME panel/watchdog startup to Linux.

## Reproduce

From a checkout, with the native suite installed:

```powershell
$robos = "$env:USERPROFILE\RobOS"
# Install the optional test driver into the installed test package.
Push-Location "$robos\packages\robos-test"
& "$robos\runtime\node.exe" "$robos\runtime\node_modules\npm\bin\npm-cli.js" install --omit=dev --no-audit --no-fund
Pop-Location
& "$robos\runtime\node.exe" scripts/windows/audit.cjs $robos
```

Pass app IDs after the installation path to audit a subset. Reports and screenshots are written under `run/windows-audit/`. The Windows CI workflow installs into a fresh folder, runs setup/compatibility checks, exercises the launcher, and then audits the entire catalog. JSON reports and screenshots are uploaded as CI artifacts; audit profile directories are excluded.

This verifies startup and initial rendering. Configured service integrations, credential setup, agent execution, Linux UID/tmpfs isolation, GNOME controls, KVM and full gameplay require their own functional tests.

## Final results

**90/90 passed:** all 89 catalog apps and the native Windows launcher. Windows build 10.0.26200, Electron 33.4.11. Seven setup/compatibility regression checks and 20 targeted existing unit checks also passed.

[Machine-readable results](assets/evidence/windows-startup-audit.json)

| Application | Package | Startup |
|---|---|---|
| RobOS Launcher | `launcher` | Pass |
| Adapter Studio | `adapter-studio` | Pass |
| Agent Autoconfig | `agent-autoconfig` | Pass |
| Agent Chat | `agent-chat` | Pass |
| Agent Sidebar | `agent-sidebar` | Pass |
| Agents Manager | `agents-manager` | Pass |
| AI Prompt | `ai-prompt` | Pass |
| App Wizard | `app-wizard` | Pass |
| Audio Player | `audio-player` | Pass |
| Auto Center | `auto-center` | Pass |
| Automation Studio | `automation-studio` | Pass |
| CI Monitor | `ci-monitor` | Pass |
| CI Monitor MCP Server | `ci-monitor-mcp` | Pass |
| Context Manager | `context-manager` | Pass |
| Contract Studio | `contract-studio` | Pass |
| RobOS cRPG Editor | `crpg-editor` | Pass |
| cRPG Game Builder Academy | `crpg-game-builder-elearning` | Pass |
| Data Sources | `data-sources` | Pass |
| Relational DB Manager | `db-manager` | Pass |
| Deploy Tracker | `deploy-tracker` | Pass |
| Desktop Agents Viewer | `desktop-agents` | Pass |
| Desktop Customizer | `desktop-customizer` | Pass |
| Desktop Dashboard | `desktop-dashboard` | Pass |
| Desktop Manager | `desktop-manager` | Pass |
| Desktop Widgets | `desktop-widgets` | Pass |
| Dev Central | `dev-central` | Pass |
| Dev Discussions | `dev-discussions` | Pass |
| Dev Tools MCP Server | `dev-tools-mcp` | Pass |
| DocuVault Desktop | `docu-vault-desktop` | Pass |
| Engineering Knowledge Graph MCP Server | `ekgraph-mcp` | Pass |
| Git Login Manager | `git-login-manager` | Pass |
| Git Projects | `git-projects` | Pass |
| Gitea Browser | `gitea-browser` | Pass |
| GraphQL Client | `graphql-client` | Pass |
| Group Manager | `group-manager` | Pass |
| gRPC Client | `grpc-client` | Pass |
| Home Speaker | `home-speaker` | Pass |
| Icon Manager | `icon-manager` | Pass |
| IDE Bridge MCP Server | `ide-bridge-mcp` | Pass |
| IntelliJ IDEA Bridge | `intellij-idea` | Pass |
| Issue Manager | `issue-manager` | Pass |
| KGraph Parse Portal | `kgraph-parse-portal` | Pass |
| Kube Studio | `kube-studio` | Pass |
| Manager Dashboard | `manager-dashboard` | Pass |
| MCP Manager | `mcp-manager` | Pass |
| NoSQL DB Manager | `nosql-manager` | Pass |
| Notifications | `notifications` | Pass |
| Package Manager | `package-manager` | Pass |
| Pass Manager | `pass-manager` | Pass |
| People Directory | `people-directory` | Pass |
| People Manager | `people-manager` | Pass |
| Point of Sale | `point-of-sale` | Pass |
| PR Review Board | `pr-review` | Pass |
| Remote Execution Studio | `remote-execution-studio` | Pass |
| Report Builder | `report-builder` | Pass |
| REST API Client (Bruno) | `rest-client` | Pass |
| Agent Session Library | `robos-agent-session` | Pass |
| Agent Daemon (agentd) | `robos-agentd` | Pass |
| RobOS CLI Tools | `robos-cli` | Pass |
| RobOS Documentation | `robos-documentation` | Pass |
| RobOS eLearning | `robos-elearning` | Pass |
| Knowledge Graph Explorer | `robos-graph` | Pass |
| System Logs Viewer | `robos-logs` | Pass |
| MCP Server Framework | `robos-mcp-lib` | Pass |
| MCP Router | `robos-mcp-router` | Pass |
| RobOS Setup Wizard | `robos-onboarding` | Pass |
| RobOS Preferences | `robos-preferences` | Pass |
| Agent Profile Daemon | `robos-profiled` | Pass |
| RobOS Tabletop Studio | `robos-tabletop` | Pass |
| Toast Daemon | `robos-toast` | Pass |
| Schema Studio & Registry | `schema-studio` | Pass |
| Search Index | `search-index` | Pass |
| Security Setup | `security-setup` | Pass |
| Skills Manager | `skills-manager` | Pass |
| Software Center | `software-center` | Pass |
| Stage Demo Viewer | `stage-demo` | Pass |
| System MCP Server | `system-mcp` | Pass |
| Tabletop Blockmap Creator | `tabletop-blockmap-creator` | Pass |
| Tabletop Quest Map Editor | `tabletop-quest-editor` | Pass |
| Task Board | `task-board` | Pass |
| Task Implementer | `task-implementer` | Pass |
| Task Manager MCP Server | `task-manager-mcp` | Pass |
| RobOS Task Explorer | `task-planner` | Pass |
| Task Servers | `task-servers` | Pass |
| System Topology Studio | `topology-manager` | Pass |
| RobOS Voice | `voice-prompt` | Pass |
| Workflow Studio | `workflow-studio` | Pass |
| Workspace Manager | `workspace-manager` | Pass |
| Workspace Manager MCP Server | `workspace-manager-mcp` | Pass |
| Household | `household` | Pass |
