---
title: "Pulse Metrics CLI"
layout: default
parent: RobOS Projects
permalink: /projects/pulse-metrics-cli/
---

# Pulse Metrics CLI
{: .no_toc }

Terminal-based server health diagnostics, network latency pinger, and automated uptime reporting utility.
{: .fs-6 .fw-300 }

Scaffolded via the **RobOS App Wizard / Create Project** (robos:ConsoleApp).

## Architectural Specification

| Attribute | Specification |
|:---|:---|
| **Archetype** | `robos:ConsoleApp` |
| **Technology** | `Node.js 20 / CLI` |
| **Package URN** | `urn:robos:console-app:pulse-metrics-cli` |
| **Ownership** | `platform-team` |
| **Target Directory** | `packages/pulse-metrics-cli/` |

## Verification & Execution

Run developer setup and automated verification:
```bash
cd packages/pulse-metrics-cli
./dev-setup.sh
npm test
```
