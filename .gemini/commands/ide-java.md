# `/ide-java` — RobOS Java IDE Automation & Debugger

Control and automate JetBrains IntelliJ IDEA for Java development via the port 63343 IPC server and `ide-bridge-mcp`.

## Usage

```bash
/ide-java <subcommand> [options]
```

### Subcommands

- `/ide-java create-config --name "<name>" --type <JUnit|Application|Maven|Gradle> [--pass-secrets "<ENV=pass:path>"]`: Author run/debug configuration with zero plaintext secrets.
- `/ide-java debug --name "<name>"`: Launch debug session and attach debugger.
- `/ide-java stop --name "<name>"`: Stop execution and trigger ephemeral workspace teardown.
- `/ide-java thread-state`: Inspect suspended thread call stack frames and local variables.
- `/ide-java webhook --url "<url>"`: Register webhook callback URL for breakpoint events.
- `/ide-java ephemeral-workspace --projects "<p1>,<p2>" [--auto-debug "<name>"] [--auto-destroy]`: Launch multi-project workspace.
