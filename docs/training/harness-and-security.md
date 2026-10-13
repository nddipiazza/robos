---
title: Agent harness and security
layout: default
parent: Training
nav_order: 2
has_children: true
permalink: /training/harness-and-security/
redirect_from:
  - /training/agent-harness-engineering/
---

# Agent harness and security
{: .no_toc }

Three lessons on the parts of RobOS that sit between you and a coding agent: a guard that scans prompts, a router that sends a task to an agent CLI, and a daemon that gives an agent a separate home directory.
{: .fs-6 }

These are three separate pieces of code. The in-process router calls the guard, and the profile daemon is independent of both. None of them is a filesystem or network sandbox. Each lesson says what it checks, where it runs and where it stops.

```mermaid
graph LR
    subgraph Router["Harness router: packages/robos-agent-client"]
        Embedded["EmbeddedHarnessRouter<br/>(or a UHP server client)"]
        Guard["Prompt security guard<br/>packages/robos-lib"]
        Embedded -->|"scans the prompt"| Guard
        Guard --> Secrets["Secret patterns"]
        Guard --> PII["Personal data and Luhn card check"]
        Guard --> Injection["Injection phrases"]
        Guard --> Entropy["High-entropy tokens"]
    end

    Embedded -->|"redacted or approved prompt"| Claude["claude"]
    Embedded --> Codex["codex"]
    Embedded --> Copilot["copilot"]

    subgraph Profiles["Independent: packages/robos-profiled"]
        Daemon["Profile daemon"] --> Home["Throwaway HOME directory<br/>for a command"]
    end

    style Embedded fill:#701a75,stroke:#f43f5e,color:#fff
    style Guard fill:#064e3b,stroke:#10b981,color:#fff
    style Home fill:#164e63,stroke:#00e5ff,color:#fff
```

![Three stages left to right: multi-model agents, a protocol gateway with a prompt security guard that scans for secrets, personal data, injection and entropy, and a disposable execution boundary with a RAM sandbox and virtual display]({{ '/assets/images/training/uhp-security-harness-architecture.jpg' | relative_url }}){: .robos-zoomable-img loading="lazy" }
*Concept diagram from the original design docs. The text on this page says what is built today: the guard runs inside the router, and the profile daemon is a separate piece that does not sandbox the agent.*

| Lesson | Code | What it is |
|:---|:---|:---|
| [Configure the prompt security guard]({{ '/training/harness-and-security/prompt-security-guard.html' | relative_url }}) | `packages/robos-lib/prompt-security.js` | A regex and entropy scanner that redacts or blocks prompt text before it is sent. |
| [Run tasks through the harness router]({{ '/training/harness-and-security/harness-router.html' | relative_url }}) | `packages/robos-agent-client/harness-router.js` | A client for the Unified Harness Protocol (UHP), with an in-process fallback that runs local agent CLIs. |
| [Run commands in an ephemeral agent profile]({{ '/training/harness-and-security/agent-profiles.html' | relative_url }}) | `packages/robos-profiled` | A daemon that creates a throwaway home directory and environment for a command. |

For how RobOS picks models for different jobs, see [Agent tiers]({{ site.baseurl }}{% link agent-tiers.md %}). For the role prompts given to agents, see [Choose and customize agent personas]({{ '/training/agent-tasks/agent-personas.html' | relative_url }}).
