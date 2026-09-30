---
title: "DocuVault Desktop"
layout: default
parent: RobOS Projects
permalink: /projects/docu-vault-desktop/
---

# DocuVault Desktop
{: .no_toc }

Offline-first secure markdown notes, personal snippet vault, and encrypted local storage workstation tool.
{: .fs-6 .fw-300 }

Scaffolded via the **RobOS App Wizard / Create Project** (robos:DesktopApp).

## Architectural Specification

| Attribute | Specification |
|:---|:---|
| **Archetype** | `robos:DesktopApp` |
| **Technology** | `Electron 29 / Vanilla JS` |
| **Package URN** | `urn:robos:desktop-app:docu-vault-desktop` |
| **Ownership** | `platform-team` |
| **Target Directory** | `packages/docu-vault-desktop/` |

## Verification & Execution

Run developer setup and automated verification:
```bash
cd packages/docu-vault-desktop
./dev-setup.sh
npm test
```
