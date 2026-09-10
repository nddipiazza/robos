---
name: ide-java
description: Automate Java development in IntelliJ IDEA over the RobOS port 63343 IPC/MCP bridge. Create secret-secured run/debug configurations, trigger breakpoints, inspect paused thread stacks and local variables, and spin up ephemeral multi-project workspaces.
---

# Java IDE Automation & Debugger Skill (IntelliJ IDEA Bridge)

Connects AI coding agents directly into JetBrains IntelliJ IDEA via the RobOS port `63343` IPC and Model Context Protocol (`ide-bridge-mcp`). Use this skill to automate Java workflows:
- **Secret-Managed Run/Debug Configurations**: Configure Maven, Gradle, Spring Boot, or JUnit run configs with runtime UNIX `pass` GPG secret injection (zero plaintext secrets on disk).
- **Interactive Breakpoint Debugging**: Set breakpoints at reproduction sites and pause execution during reproduction tests.
- **Paused Thread & Variable Inspection**: Extract thread call stack frames, parameter values, and heap objects from suspended Java threads.
- **Breakpoint Webhooks**: Register webhook callbacks to be notified immediately when a breakpoint triggers.
- **Ephemeral Multi-Project Workspaces**: Orchestrate multi-repo project roots in IntelliJ IDEA with optional immediate debug launching and auto-destroy cleanup upon session completion.

---

## Input

`$ARGUMENTS` — Subcommand and options:

### 1. Create Run/Debug Configuration
```bash
ide-java create-config --name "<config-name>" --type <Application|JUnit|Maven|Gradle> [--project "<path>"] [--target "<class-or-command>"] [--env "<KEY=VAL>"] [--pass-secrets "<KEY=pass:path>"]
```
- Creates an IntelliJ run configuration.
- Secret references (e.g. `pass:acme/vaccine-gateway-mTLS`) are resolved at runtime in-memory and never committed to `.idea/runConfigurations/` XML.

### 2. Run or Debug
```bash
ide-java debug --name "<config-name>" [--breakpoint "<file>:<line>"]
ide-java run --name "<config-name>"
```
- Dispatches execution in IntelliJ. In debug mode, attaches the debugger and suspends execution when breakpoints are reached.

### 3. Stop Active Configuration
```bash
ide-java stop --name "<config-name>"
```
- Terminates the running Java process and notifies the ephemeral workspace manager for session-end cleanup.

### 4. Inspect Paused Thread State
```bash
ide-java thread-state [--thread-id "<id>"]
```
- Fetches the active suspended Java thread, top stack frames, and evaluated local variables.

### 5. Register Breakpoint Webhook
```bash
ide-java webhook --url "<http-callback-url>"
```
- Registers an HTTP webhook endpoint to receive JSON notifications whenever a breakpoint is triggered.

### 6. Ephemeral Multi-Project Workspace
```bash
ide-java ephemeral-workspace --projects "<path1>,<path2>" [--auto-debug "<config-name>"] [--auto-destroy]
```
- Provisions a unified multi-project workspace in IntelliJ IDEA.

---

## Procedure

### Using MCP Protocol Tools (`ide-bridge-mcp`)

When using Model Context Protocol tools, invoke:

1. **Create Configuration**:
   ```json
   {
     "tool": "robos_ide_create_run_config",
     "arguments": {
       "name": "Debug PetServiceTest",
       "type": "JUnit",
       "projectPath": "/workspace/petstore-api",
       "mainClassOrCommand": "com.acme.petshop.service.PetServiceTest",
       "env": { "SPRING_PROFILES_ACTIVE": "test" },
       "passSecrets": { "MTLS_KEYSTORE": "pass:acme/vaccine-gateway-mTLS" }
     }
   }
   ```

2. **Register Webhook for Breakpoint Events**:
   ```json
   {
     "tool": "robos_ide_register_breakpoint_webhook",
     "arguments": {
       "webhookUrl": "http://127.0.0.1:9099/webhook/breakpoint"
     }
   }
   ```

3. **Launch Debug Session**:
   ```json
   {
     "tool": "robos_ide_run_config",
     "arguments": {
       "name": "Debug PetServiceTest",
       "mode": "debug"
     }
   }
   ```

4. **Inspect Suspended State on Breakpoint Event**:
   ```json
   {
     "tool": "robos_ide_get_thread_state",
     "arguments": {}
   }
   ```

5. **Spin Up Ephemeral Multi-Project Workspace**:
   ```json
   {
     "tool": "robos_ide_create_ephemeral_workspace",
     "arguments": {
       "workspaceId": "ws-petstore-polyglot",
       "projects": ["/workspace/petstore-api", "/workspace/petstore-web", "/workspace/shared-lib"],
       "autoRunConfig": "Debug PetServiceTest",
       "autoDestroyOnSessionEnd": true
     }
   }
   ```

---

## Direct IPC Endpoints (Port 63343)

The RobOS IntelliJ plugin exposes these REST endpoints on `http://127.0.0.1:63343`:
- `GET /robos/health`: Health status and plugin version.
- `POST /robos/run-config/create`: Create run config with pass secrets.
- `POST /robos/run-config/run`: Run or debug a configuration.
- `POST /robos/run-config/stop`: Stop execution.
- `POST /robos/webhook/register`: Register breakpoint webhook URL.
- `GET /robos/debug/thread-state`: Get paused thread stack frames & variables.
- `POST /robos/workspace/ephemeral`: Load multi-project workspace.
- `GET /robos/workspace/destroy?workspaceId=<id>`: Clean up ephemeral workspace.

---

## Validation

- Ensure port 63343 responds: `curl http://127.0.0.1:63343/robos/health`.
- Verify secrets are masked/resolved without writing plaintext passwords to repository files.
- Verify breakpoint webhooks deliver valid JSON payloads with stack frames and local variables.
