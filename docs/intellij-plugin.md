# RobOS IntelliJ Plugin

The RobOS IntelliJ plugin gives the RobOS desktop direct control over IntelliJ IDEA (and other JetBrains IDEs). It is a plugin built on top of the standard IntelliJ platform — nothing in the upstream platform is modified.

All source lives under `platform/robos/` in the `packages/robos-intellij-plugin` repo (a fork of `intellij-community`).

---

## What It Does

When installed, the plugin:

1. Starts a local HTTP server on port **63343** at IDE launch
2. Opens a WebSocket connection to the RobOS notification bus
3. Adds a **RobOS** tool window to the IDE showing ticket context, branch, and collaborators
4. Exposes an HTTP API that RobOS desktop apps use to control the IDE remotely

---

## IPC API (port 63343)

All endpoints accept and return `application/json`.

| Method | Path | Body / Response |
|---|---|---|
| `GET` | `/robos/health` | `{ ok: true, version: "1.0.0" }` |
| `GET` | `/robos/status` | Current workspace state (ticket, branch, project path, focused minutes) |
| `POST` | `/robos/open-project` | `{ path: "/home/robos/projects/my-repo" }` — opens directory as project |
| `POST` | `/robos/open-file` | `{ file: "/path/to/file.sh" }` — opens file in editor |
| `POST` | `/robos/navigate` | `{ file, line, column }` — navigates to exact location |
| `POST` | `/robos/run` | `{ configuration: "RobOS: setup" }` — runs a named run configuration |
| `POST` | `/robos/stop` | Stops the currently running configuration |
| `POST` | `/robos/notify` | `{ message, title, severity }` — shows balloon notification |
| `POST` | `/robos/workspace` | `{ ticketId, ticketTitle, branch, collaborators }` — updates side panel |

### Checking if the plugin is ready

Poll `GET /robos/health` — it returns `{ ok: true }` when the plugin is up. The Git Projects app polls every 3 seconds for up to 3 minutes after launching IntelliJ.

---

## How Git Projects Uses It

When **🧠 Run in IntelliJ** is clicked in Git Projects:

1. Save all 4 scripts (setup/start/test/e2e) to `~/.config/robos/git-projects/{projectId}/`
2. Write `.idea/runConfigurations/RobOS_{key}.xml` into the **git project directory**:
   ```xml
   <configuration name="RobOS: setup" type="ShConfigurationType">
     <option name="SCRIPT_PATH" value="/home/robos/.config/robos/git-projects/{id}/setup.sh" />
     <option name="SCRIPT_WORKING_DIRECTORY" value="/home/robos/projects/my-repo" />
   </configuration>
   ```
   `SCRIPT_WORKING_DIRECTORY` is the **git project's local checkout path** — this is the CWD when the script runs.
3. Check `GET /robos/health` — if plugin is not up, launch IntelliJ with the project path and wait
4. `POST /robos/open-project { path: projectLocalPath }`
5. `POST /robos/open-file { file: scriptPath }` — brings the script into focus in the editor
6. `POST /robos/run { configuration: "RobOS: setup" }` — executes the run config in IntelliJ's terminal

---

## Plugin Installation

The plugin is distributed as a ZIP file. The IDE Manager app handles installation:

### Install path on Linux
```
~/.local/share/JetBrains/IdeaIC<Version>/robos/
```

This is `idea.plugins.path` as logged by IntelliJ. There is **no** `plugins/` subdirectory — the plugin folder is a direct child of the version directory.

> ⚠️ `~/.config/JetBrains/` is for IDE settings only — IntelliJ does not load plugins from there.

### Install procedure (IDE Manager)
1. Kill IntelliJ (match `/opt/idea` to avoid killing other processes)
2. Remove any stale plugin copies from both `~/.local/share/JetBrains/` and `~/.config/JetBrains/`
3. Unzip plugin ZIP to `~/.local/share/JetBrains/IdeaIC<Version>/`
4. Relaunch IntelliJ with the project path

### Uninstall via IntelliJ UI
When you uninstall a plugin through IntelliJ's plugin manager, the files are **queued for deletion on next restart** — not deleted immediately. Filesystem checks will still show the plugin as "installed" until IntelliJ is restarted.

---

## Building the Plugin

Prerequisites: JDK 17+, Gradle 8+, ~40 GB disk

```bash
cd packages/robos-intellij-plugin
git remote add upstream https://github.com/JetBrains/intellij-community.git
./gradlew :platform:robos:buildPlugin
```

Output ZIP: `platform/robos/build/distributions/robos-*.zip`

---

## Plugin Components

| Class | Package | Purpose |
|---|---|---|
| `RobosIpcServer` | `ipc/` | Netty HTTP server startup/shutdown |
| `RobosIpcHandler` | `ipc/` | Routes requests to IDE actions |
| `NotificationBusClient` | `bus/` | WebSocket → RobOS notification bus |
| `RobosWorkspaceService` | `services/` | Holds ticket/branch/collaborator state |
| `RobosToolWindowFactory` | `ui/` | Side panel factory |
| `TicketContextPanel` | `ui/` | Side panel content |
| `RobosStartupActivity` | `startup/` | Starts IPC server + bus client at launch |
