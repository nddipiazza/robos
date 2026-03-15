# robos-intellij

A fork of [intellij-community](https://github.com/JetBrains/intellij-community) with a built-in **RobOS IPC layer** that lets the RobOS Workspace Agent control the IDE over a local HTTP connection.

> **Relationship to roboto-os**  
> This repo is a companion to [nddipiazza/roboto-os](https://github.com/nddipiazza/roboto-os).  
> The `mcp-idea` MCP server in that repo is the client that calls the IPC API exposed here.

---

## What's different from vanilla IntelliJ

All RobOS additions live under `platform/robos/`. Nothing in the upstream IntelliJ platform is modified — RobOS registers itself through the standard extension-point / service mechanism, so the fork can be rebased cleanly against upstream releases.

| Addition | Location | Purpose |
|---|---|---|
| `RobosIpcServer` | `ipc/` | Netty HTTP server on port `63343` |
| `RobosIpcHandler` | `ipc/` | Routes IPC requests to IDE actions |
| `NotificationBusClient` | `bus/` | WebSocket client → RobOS notification-bus |
| `NotificationBusAppService` | `startup/` | ApplicationService wrapper for the bus client |
| `RobosWorkspaceService` | `services/` | Holds ticket, branch, collaborator state |
| `RobosToolWindowFactory` / `TicketContextPanel` | `ui/` | Side panel with ticket context |
| `RobosStartupActivity` | `startup/` | Starts IPC server + bus client at IDE launch |
| `plugin.xml` | `resources/META-INF/` | Registers all of the above |

---

## Building

### Prerequisites

- JDK 17+
- Gradle 8+ (wrapper included)
- ~40 GB disk (full intellij-community checkout)

### Steps

```bash
# 1. Add the upstream intellij-community remote (first time only)
git remote add upstream https://github.com/JetBrains/intellij-community.git
git fetch upstream

# 2. Build just the RobOS module (runs against the IntelliJ Platform Gradle plugin,
#    which downloads a pre-built platform — no need to compile all of IC yourself)
./gradlew :platform:robos:buildPlugin

# 3. The distributable plugin ZIP will be at:
#    platform/robos/build/distributions/robos-<version>.zip

# 4. Install into any JetBrains IDE:
#    Settings → Plugins → ⚙ → Install Plugin from Disk…
```

> **For a full fork build** (shipping a custom IntelliJ binary):  
> Follow the [intellij-community build instructions](https://github.com/JetBrains/intellij-community/blob/master/README.md),
> then include the `platform/robos` module in the platform build configuration.

---

## Environment variables

| Variable | Default | Description |
|---|---|---|
| `ROBOS_IPC_PORT` | `63343` | Port the IPC HTTP server listens on |
| `ROBOS_BUS_HOST` | `localhost` | Hostname of the RobOS notification-bus |
| `ROBOS_BUS_PORT` | `3700` | Port of the RobOS notification-bus WebSocket |

---

## IPC API reference

All endpoints are served at `http://localhost:$ROBOS_IPC_PORT`. All bodies are `application/json`.

### `GET /robos/health`

Returns server status. Use this to confirm the IDE is ready before sending further commands.

**Response**
```json
{ "ok": true, "version": "1.0.0" }
```

---

### `GET /robos/status`

Returns current workspace state.

**Response**
```json
{
  "ticketId": "PROJ-123",
  "ticketTitle": "Fix login redirect",
  "branch": "feature/PROJ-123-fix-login",
  "projectPath": "/home/user/repos/myapp",
  "focusedMinutes": 47,
  "collaborators": [
    { "username": "alice", "displayName": "Alice K.", "lastActivity": "editing AuthService.kt" }
  ],
  "ipcPort": 63343
}
```

---

### `POST /robos/open-project`

Opens a project directory in the IDE. Creates a new project window if none is open.

**Body**
```json
{ "path": "/home/user/repos/myapp" }
```

**Response**
```json
{ "ok": true, "path": "/home/user/repos/myapp" }
```

---

### `POST /robos/open-file`

Opens a file in the editor (foreground tab).

**Body**
```json
{ "file": "/home/user/repos/myapp/src/main/kotlin/AuthService.kt" }
```

**Response**
```json
{ "ok": true, "file": "..." }
```

---

### `POST /robos/navigate`

Opens a file and moves the caret to a specific line/column.

**Body**
```json
{ "file": "/path/to/file.kt", "line": 42, "column": 7 }
```

**Response**
```json
{ "ok": true, "file": "...", "line": 42, "column": 7 }
```

---

### `POST /robos/run`

Runs a named Run Configuration (must already exist in the project).

**Body**
```json
{ "configuration": "Run Tests" }
```

**Response**
```json
{ "ok": true, "configuration": "Run Tests" }
```

---

### `POST /robos/stop`

Stops all currently running processes.

**Response**
```json
{ "ok": true }
```

---

### `POST /robos/notify`

Shows a balloon notification inside the IDE.

**Body**
```json
{
  "title": "PR Review Needed",
  "message": "alice opened a PR that needs your review: #142",
  "severity": "warning"
}
```

`severity`: `"info"` | `"warning"` | `"urgent"` (maps to INFORMATION / WARNING / ERROR balloon types)

**Response**
```json
{ "ok": true }
```

---

### `POST /robos/workspace`

Updates the workspace metadata displayed in the RobOS tool window panel.
Called by the Workspace Agent when materializing a ticket desktop.

**Body** (all fields optional)
```json
{
  "ticketId":    "PROJ-123",
  "ticketTitle": "Fix login redirect",
  "ticketUrl":   "https://company.atlassian.net/browse/PROJ-123",
  "branch":      "feature/PROJ-123-fix-login",
  "collaborators": [
    {
      "username":     "alice",
      "displayName":  "Alice K.",
      "avatarUrl":    "https://...",
      "lastActivity": "editing AuthService.kt"
    }
  ]
}
```

**Response**
```json
{ "ok": true }
```

---

## Notification-bus events surfaced in the IDE

The following RobOS bus events are shown as IDE balloon notifications:

| Event | Balloon type |
|---|---|
| `BLOCKER_DETECTED` | 🔴 Error |
| `ISSUE_REPORTED_YOUR_CHANGE` | 🔴 Error |
| `MEETING_APPROACHING_2M` | 🔴 Error |
| `MEETING_TAKEOVER` | 🔴 Error |
| `PR_REVIEW_NEEDED` | 🟡 Warning |
| `PR_AGING_WARNING` | 🟡 Warning |
| `PR_STALE_CLOSE_SUGGESTION` | 🟡 Warning |
| `MEETING_APPROACHING_10M` | 🟡 Warning |
| All others | ℹ️ Information |

---

## Rebasing against upstream

```bash
git fetch upstream
git rebase upstream/master
# Resolve any conflicts in platform/robos/ (unlikely — we don't touch upstream files)
./gradlew :platform:robos:buildPlugin
```

---

## License

The RobOS additions (`platform/robos/`) are MIT licensed.  
The IntelliJ Community Edition code they build against is Apache 2.0 licensed.
