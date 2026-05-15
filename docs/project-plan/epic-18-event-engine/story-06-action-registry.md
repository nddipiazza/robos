---
nav_exclude: true
---

# Story 18-06: Pluggable Action Registry

**Epic:** [Event Engine & Agent Scheduler](epic.md)
**Status:** Not started
**Points:** 5

## Description

A pluggable action type system used by both the Rule Engine (story 18-02) and the Cron Scheduler (story 18-04). Each action type is a module that knows how to execute a specific kind of side-effect. The registry provides discovery, validation, and execution for all action types.

### Built-in Action Types

| Action Type | Description | Parameters |
|-------------|-------------|------------|
| `notify` | Send categorized/tiered notification via Toast Daemon | `tier`, `category`, `title`, `message`, `action` (click command) |
| `run_script` | Execute shell command with templated args | `command`, `cwd`, `timeout`, `env` |
| `launch_app` | Open a RobOS Electron app | `appId`, `args` |
| `launch_agent` | Start AI agent session via Agent Manager IPC | `prompt`, `context`, `timeout`, `sandbox` |
| `webhook` | POST JSON payload to external URL | `url`, `headers`, `body` |
| `journal_append` | Write a journal entry | `text`, `type` |

### Action Interface

Each action type implements:

```js
{
  type: 'notify',                    // Unique action type ID
  label: 'Send Notification',       // Human-readable name for UI
  description: 'Send a categorized toast notification',
  params: {                          // Parameter schema for UI form generation
    tier: { type: 'enum', values: ['critical', 'warning', 'info'], required: true },
    category: { type: 'enum', values: ['pr_review', 'ci_cd', 'task', 'agent', 'system'], required: true },
    title: { type: 'string', required: true, templatable: true },
    message: { type: 'string', required: false, templatable: true },
    action: { type: 'string', required: false, templatable: true }
  },
  execute: async (params, context) => { /* ... */ }
}
```

### Registry API

```js
const registry = require('robos-lib/action-registry');

// Discovery
registry.listTypes();              // ['notify', 'run_script', 'launch_app', ...]
registry.getType('notify');        // Returns full action type definition
registry.getParamSchema('notify'); // Returns parameter schema for UI form

// Execution
await registry.execute('notify', { tier: 'critical', ... }, eventContext);

// Validation
registry.validate('notify', params); // Returns { valid: true } or { valid: false, errors: [...] }
```

### Template Resolution

Before execution, the registry resolves `{{template}}` variables in all parameters marked `templatable: true`:
- Variables from the triggering event envelope (`{{type}}`, `{{payload.field}}`, etc.)
- Variables from previous pipeline steps (`{{steps[0].output}}`)
- Built-in variables: `{{now}}`, `{{user}}`, `{{hostname}}`

### Plugin Extensibility

Third-party or user-defined action types can be registered by placing modules in `~/.config/robos/action-plugins/`:

```
~/.config/robos/action-plugins/
  slack-notify/
    index.js    # Exports action type definition
    package.json
```

The registry scans this directory on startup and registers any valid action type modules.

### Error Handling

- Each action execution returns `{ success: true, output: ... }` or `{ success: false, error: ... }`
- Output captured for pipeline step access (`{{steps[N].output}}`)
- Timeout enforcement per action (default 30s for scripts, 300s for agents)
- Actions log execution to `~/.config/robos/event-log/action-executions.jsonl`

## Acceptance Criteria

- [ ] All 6 built-in action types implemented and registered
- [ ] `notify` action sends categorized notification via Toast Daemon IPC
- [ ] `run_script` executes shell command with timeout and captures output
- [ ] `launch_app` opens specified RobOS Electron app
- [ ] `launch_agent` starts AI agent session (graceful error if Agent Manager unavailable)
- [ ] `webhook` POSTs JSON to URL with configurable headers
- [ ] `journal_append` writes entry to journal event file
- [ ] Registry API: listTypes, getType, getParamSchema, execute, validate all work
- [ ] Template variable resolution for all templatable parameters
- [ ] Plugin directory scanned on startup; user-defined action types loaded
- [ ] Action execution logged to `action-executions.jsonl`
- [ ] Parameter validation catches missing required params and invalid enum values
