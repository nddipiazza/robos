# RobOS IntelliJ IDEA Platform Plugin

The **RobOS IntelliJ IDEA Platform Plugin** connects JetBrains IDEs directly to the RobOS AI-First SDLC Platform and Autonomous Agent Governance Harness.

## Features

1. **High-Performance Port 63343 IPC Server**:
   - Responds to `/robos/health`, `/robos/open-file`, `/robos/set-breakpoint`.
   - Injects, launches, and terminates run configurations dynamically (`/robos/run-config/*`).
   - Ephemeral multi-project workspace lifecycle orchestration (`/robos/workspace/*`).
2. **Zero-Plaintext Secret Resolution**:
   - Injects sensitive credentials from UNIX `pass` GPG store (`pass:<path>`) directly into process environment in-memory.
   - Never commits plaintext tokens or passwords to `.idea/runConfigurations/` XML or git.
3. **Breakpoint Webhook & Interactive Thread Inspection**:
   - Dispatches webhook notifications to `/robos/webhook/register` listeners upon breakpoint suspension.
   - Exposes top stack frames and evaluated local variables at `/robos/debug/thread-state`.
4. **Native Pull Request & Task Review Tool Window**:
   - RobOS Tool Window displaying active task ticket, branch, GPG vault credentials, and AI proposed plans.

## Building & Installing

### Prerequisites
- JDK 17+
- IntelliJ IDEA Ultimate 2024.1+ (or Community Edition)

### Build Plugin Archive
```bash
./gradlew buildPlugin
```
Artifact generated at `build/distributions/robos-intellij-plugin-1.0.0.zip`.

### Installation in IntelliJ IDEA
1. Open IntelliJ IDEA -> **Settings / Preferences** -> **Plugins**.
2. Click the gear icon ⚙️ -> **Install Plugin from Disk...**.
3. Select `build/distributions/robos-intellij-plugin-1.0.0.zip`.
4. Restart IntelliJ IDEA. The RobOS IPC server will automatically listen on `http://127.0.0.1:63343`.
