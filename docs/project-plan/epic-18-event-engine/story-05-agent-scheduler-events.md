# Story 18-05: Agent Scheduler — Event Triggers

**Epic:** [Event Engine & Agent Scheduler](epic.md)
**Status:** Not started
**Points:** 5

## Description

Extends the Rule Engine (story 18-02) with agent-specific action types that allow events to trigger AI agent sessions and complex multi-step automations. This is the bridge between the Event Engine and Epic 06 (AI Agent Integration).

### Event-Triggered Agent Sessions

When an event matches a rule with a `launch_agent` action, the scheduler:

1. Connects to the Agent Manager (Epic 06) via IPC
2. Provides the event payload as agent context
3. Starts an AI agent session with a templated prompt
4. Monitors session status and emits completion events back to the Event Bus

### Example Rules with Agent Triggers

**Auto-triage CI failures:**
```json
{
  "name": "Auto-triage CI failure",
  "trigger": {
    "eventType": "ci_completed",
    "conditions": [{ "field": "payload.status", "op": "eq", "value": "failure" }]
  },
  "actions": [
    {
      "type": "launch_agent",
      "params": {
        "prompt": "CI run #{{payload.runId}} failed on {{payload.repo}} branch {{payload.branch}}. Analyze the failure logs and suggest a fix.",
        "context": ["repo:{{payload.repo}}", "branch:{{payload.branch}}"],
        "timeout": 300
      }
    },
    {
      "type": "notify",
      "params": { "tier": "critical", "category": "ci_cd", "title": "CI Failed — agent triaging" }
    }
  ]
}
```

**Auto-generate PR description:**
```json
{
  "name": "Auto-generate PR description",
  "trigger": { "eventType": "pr_opened", "conditions": [] },
  "actions": [
    {
      "type": "launch_agent",
      "params": {
        "prompt": "Generate a PR description for PR #{{payload.prNumber}} in {{payload.repo}}. Summarize the changes and suggest reviewers.",
        "timeout": 120
      }
    }
  ]
}
```

### Multi-Step Pipelines

Actions in a rule execute in order. Combined with the `run_script` and `launch_agent` actions, this enables multi-step automation pipelines:

1. Event triggers rule
2. `run_script` gathers data (e.g., fetch CI logs)
3. `launch_agent` analyzes the data
4. `notify` sends the result to the developer
5. `journal_append` records what happened

Each step's output is available to subsequent steps via `{{steps[N].output}}` template variable.

### Timeout & Cancellation

- Agent sessions have a configurable timeout (default 300s)
- If timeout is reached, session is cancelled and a `system` warning notification is sent
- User can cancel running agent sessions from the Automation Studio UI (Event Log tab shows active sessions)

### Guardrails

- Maximum concurrent event-triggered agent sessions: 3 (configurable)
- Rate limit: max 10 agent launches per hour per rule (prevents runaway loops)
- Agent sessions triggered by events run in a sandboxed context (read-only by default, no push/deploy actions unless explicitly allowed in rule config)

## Acceptance Criteria

- [ ] `launch_agent` action type starts AI agent session via Agent Manager IPC
- [ ] Event payload injected as agent context with template variable support
- [ ] Agent session completion emits event back to Event Bus
- [ ] Multi-step pipeline executes actions in order with `{{steps[N].output}}` access
- [ ] Timeout cancels agent session and sends warning notification
- [ ] Concurrent session limit enforced (default 3)
- [ ] Rate limit enforced (default 10 per hour per rule)
- [ ] Sandboxed agent context (read-only default) with explicit opt-in for write actions
- [ ] Graceful degradation if Agent Manager (Epic 06) is not available
