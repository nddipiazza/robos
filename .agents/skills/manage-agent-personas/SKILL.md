---
name: manage-agent-personas
description: Add, customize, configure, or inspect RobOS Developer Agent Personas (such as Non-Headless Developer, Human+Agent Desktop Co-Pilot, Software Architect, etc.) and their directives, execution environments, and token-saving IDE refactoring suites.
---

# Manage RobOS Agent Personas & Personalities

Configure and customize RobOS Developer Agent Personas (`robos:AgentPersona`). RobOS equips AI agents (Claude Code, GitHub Copilot, Google Antigravity, Oh My Pi) with first-class specialized engineering roles rather than generic coding loops.

## Input

`$ARGUMENTS` — Action and persona parameters:
- `list` — List all registered built-in and custom developer personas
- `show <slug|id>` — Inspect a specific persona definition, system prompt, and guidance
- `add <slug> "<role>" "<description>" [executionMode]` — Scaffold a new developer persona
- `customize <slug>` — Guide updating development guidance, system prompts, or refactoring rules
- `reset` — Restore all personas to RobOS built-in defaults

---

## Persona Architecture & Storage

RobOS manages agent personas across two synchronization tiers:

1. **Built-in System Personas**:
   Defined in `packages/robos-lib/agent-personas.js`. These are deployed to `/usr/local/share/robos/robos-lib/agent-personas.js` and serve as canonical out-of-the-box defaults:
   - `urn:robos:agent:software-architect` — C4 domain modeling, ADRs, KGraph blast radius
   - `urn:robos:agent:frontend-web-dev` — Electron preload security, React 18, RobOS dark theme CSS
   - `urn:robos:agent:game-dev` — Godot 4 LTS, GDScript, isometric cRPGs, D&D 5e SRD
   - `urn:robos:agent:backend-dev` — Java 21 Spring Boot 3 / Node.js Fastify, OpenAPI 3.1, gRPC
   - `urn:robos:agent:data-engineer-dev` — PostgreSQL ACID schemas, Flyway migrations, Kafka streaming
   - `urn:robos:agent:devops-engineer` — Multi-cluster Kubernetes, Helm charts, ArgoCD GitOps
   - `urn:robos:agent:non-headless-dev` — Ephemeral Xvfb GUI developer, mapped IDE via IPC, step debugger, Chrome DevTools MCP, and token-saving IDE refactorings
   - `urn:robos:agent:human-agent-copilot` — Non-headless desktop co-pilot running in user's active session (`DISPLAY=:0`), collaborative IDE pairing, shared step debugging

2. **User Custom Personas & Overrides**:
   Stored persistently in `~/.config/robos/agent-personas.json`. When present, entries override built-in personas with matching IDs or add brand-new specialized roles.

3. **In-App Management**:
   Both **Task Implementer** and **Task Planner** provide the interactive **🤖 Agent Personas & Prompts** modal for reviewing, editing, creating, and resetting personas live.

---

## Procedures

### 1. Adding a New Agent Persona

#### Option A: Adding a Built-in Persona (Repository Level)
1. Open `packages/robos-lib/agent-personas.js`.
2. Add an entry to `BUILTIN_AGENT_PERSONAS`:
   ```javascript
   {
     id: 'urn:robos:agent:<slug>',
     slug: '<slug>',
     role: '<Display Role Name>',
     title: 'RobOS <Display Role Name> Agent',
     description: '<Role description and focus>',
     icon: '<Emoji Icon>',
     category: '<Category>',
     executionMode: '<headless|ephemeral-gui|desktop-session>',
     systemPrompt: `You are a specialized <Role> in RobOS...`,
     developmentGuidance: `1. Rule 1...\n2. Rule 2...`,
     planningPrompt: `Break down the task...`,
     implementationPrompt: `Implement the solution...`,
     tags: ['tag1', 'tag2'],
     modelPreference: 'pro',
     isDefault: true,
   }
   ```
3. Update fallback lists in `packages/task-implementer/renderer/app.js` and `packages/task-planner/renderer/app.js`.
4. Add detection keywords to `detectPersonaForTask()` in `packages/robos-lib/agent-personas.js`.

#### Option B: Adding a Custom Persona via File / Script
Create or append to `~/.config/robos/agent-personas.json`:
```json
[
  {
    "id": "urn:robos:agent:embedded-firmware-dev",
    "slug": "embedded-firmware-dev",
    "role": "Embedded Firmware Developer",
    "title": "RobOS Embedded Firmware Developer Agent",
    "description": "Specialist in Rust no_std, Zephyr RTOS, and hardware register simulation.",
    "icon": "⚡",
    "category": "Embedded Systems",
    "executionMode": "headless",
    "systemPrompt": "You are an Embedded Systems Firmware Developer in RobOS.",
    "developmentGuidance": "1. Memory Safety: Prefer Rust no_std.\n2. Concurrency: Use RTIC or Zephyr mutexes without busy-waiting.\n3. Hardware Emulation: Test drivers using Renode or QEMU ARM.",
    "planningPrompt": "Analyze hardware peripherals, memory maps, and interrupt priorities.",
    "implementationPrompt": "Write register abstraction layers, HAL implementations, and unit tests.",
    "tags": ["embedded", "rust", "zephyr", "firmware"],
    "isDefault": false
  }
]
```

#### Option C: Adding via Task Implementer / Task Planner GUI
1. Open **RobOS Task Implementer** or **RobOS Task Planner**.
2. Click **🤖 Agent Personas** in the header.
3. Click **+ Add Custom Persona** in the sidebar.
4. Fill in the Role, Title, Description, System Prompt, and Development Guidance.
5. Click **💾 Save Persona**.

---

### 2. Execution Modes & Environment Configuration

| Execution Mode | Target Display | Workspace Storage | Primary Use Case |
|----------------|----------------|-------------------|------------------|
| `headless` | N/A (CLI) | Standard git clone or repo directory | Pure code generation, CLI test runs, background builds |
| `ephemeral-gui` | Ephemeral Xvfb (`:99`) | Ephemeral `tmpfs` / `/tmp/robos-workspaces/` | **Non-Headless Developer**: Full GUI IDE execution, simulated user inputs via plugins, step debugger, Chrome DevTools MCP, zero host screen pollution |
| `desktop-session` | Host display (`:0`) | User's active development workspace | **Human + Agent Desktop Co-Pilot**: Collaborative pairing in the user's active IDE, shared terminal, live breakpoint stepping, synchronized refactorings |

---

### 3. Token-Saving IDE Refactorings Suite

When defining directives for GUI developers (`non-headless-dev` and `human-agent-copilot`), **always instruct the agent to utilize IDE AST refactorings instead of full-file LLM rewrites**:

```markdown
TOKEN-SAVING IDE REFACTORING DIRECTIVE:
NEVER re-generate entire source files or massive diff blocks when making structural changes.
Always invoke RobOS IDE Bridge MCP refactoring tools:
- `robos_ide_refactor_rename`: Rename classes, methods, fields, and local variables across the AST without rewriting files.
- `robos_ide_refactor_extract_method`: Extract repetitive or complex blocks into dedicated methods.
- `robos_ide_refactor_extract_variable`: Extract expressions into local variables.
- `robos_ide_refactor_move`: Relocate classes/modules to target packages with automated import updating.
- `robos_ide_refactor_safe_delete`: Safely verify and prune unused symbols.
- `robos_ide_execute_action`: Run IDE native actions (ReformatCode, OptimizeImports).
This drastically lowers token consumption, avoids context window truncation, and eliminates hallucinated syntax errors.
```

---

### 4. Interactive Step Debugging & Chrome DevTools MCP

Instruct the agent to use developer tools rather than guessing:

1. **Step-by-Step Debugger (`ide-bridge-mcp`)**:
   - `robos_ide_set_breakpoint`: Set line breakpoints in target source files.
   - `robos_ide_run_config`: Launch the application or test in `debug` mode.
   - `robos_ide_get_thread_state`: Inspect the paused call stack frames and local variables.
   - `robos_ide_register_breakpoint_webhook`: Receive automated callbacks when a breakpoint hits.

2. **Chrome DevTools MCP (`chrome-devtools-mcp`)**:
   - `take_snapshot` / `evaluate_script`: Inspect live DOM and evaluate JavaScript.
   - `list_console_messages`: Inspect client warnings and uncaught exceptions.
   - `list_network_requests`: Inspect API request payloads and HTTP status codes.

---

### 5. Verification & Testing

Verify that personas and detection heuristics function accurately:
```bash
# 1. Test Task Planner Personas & Fallback Catalog
node --test packages/robos-test/tests/task-planner/agent-personas.test.js

# 2. Test Task Implementer Personas, Dropdown & Execution Directives
node --test packages/robos-test/tests/task-implementer/agent-personas.test.js

# 3. Test IDE Bridge MCP Refactoring Suite
node --test packages/robos-test/tests/mcp-servers/ide-bridge-mcp.test.js
```
