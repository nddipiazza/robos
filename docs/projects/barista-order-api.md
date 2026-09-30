---
title: "Barista Order API"
layout: default
parent: RobOS Projects
permalink: /projects/barista-order-api/
---

# Barista Order API
{: .no_toc }

Specialty coffee roastery order queue, origin bean catalog, and barista drink fulfillment microservice.
{: .fs-6 .fw-300 }

Scaffolded via the **RobOS App Wizard / Create Project** (robos:Microservice).

## Architectural Specification

| Attribute | Specification |
|:---|:---|
| **Archetype** | `robos:Microservice` |
| **Technology** | `Node.js 20 / Express` |
| **Package URN** | `urn:robos:service:barista-order-api` |
| **Ownership** | `order-team` |
| **Target Directory** | `packages/barista-order-api/` |

## Verification & Execution

Run developer setup and automated verification:
```bash
cd packages/barista-order-api
./dev-setup.sh
npm test
```
