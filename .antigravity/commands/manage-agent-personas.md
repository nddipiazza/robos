# manage-agent-personas

Manage, inspect, and customize RobOS Developer Agent Personas (`robos:AgentPersona`).

## Usage

```bash
/manage-agent-personas [subcommand] [arguments]
```

## Subcommands

- `list` — List all registered personas with role names, categories, and execution modes
- `show <slug|id>` — Display complete details, system prompt, directives, and guidance
- `add <slug> "<role>" "<description>" [executionMode]` — Scaffold a new developer persona
- `customize <slug>` — Edit development guidance, directives, or refactoring constraints
- `reset` — Restore all agent personas to RobOS built-in defaults

## Examples

```bash
# View all developer personas
/manage-agent-personas list

# Inspect non-headless developer persona directives
/manage-agent-personas show non-headless-dev

# Inspect human + agent desktop co-pilot persona directives
/manage-agent-personas show human-agent-copilot
```
