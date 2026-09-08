---
title: KGraph Schemas
layout: default
nav_order: 3
has_children: true
permalink: /schemas.html
---

# RobOS Knowledge Graph Schemas & Ontologies
{: .no_toc }

Comprehensive, machine-readable ontologies and W3C SHACL constraint specifications governing the RobOS Dual-State SDLC Knowledge Graph across all 6 standard package stores.
{: .fs-6 .fw-300 }

## Table of contents
{: .no_toc .text-delta }

1. TOC
{:toc}

---

## Architectural Overview

RobOS structures the entire software development lifecycle as an open, interconnected **Dual-State Knowledge Graph**. Rather than proprietary siloes or monolithic configuration files, RobOS combines three international standards:

1. **OASIS OSLC Core 3.0 & W3C JSON-LD**: Global semantic web standard for linking requirements, changes, architectures, and tests.
2. **W3C SHACL (Shapes Constraint Language)**: Strictly validates graph nodes against structural schemas before saving or synthesizing code.
3. **Modular Namespaced Packages (`.robos/kgraphs/`)**: Eliminates Git merge conflicts and blurs across teams by dividing the universe into 6 domain-isolated package stores.

```mermaid
graph TB
    subgraph Hub ["RobOS SDLC Knowledge Graph (/schemas.html)"]
        Core["Platform Core<br/><code>robos.platform</code>"]
        Org["Organization & Teams<br/><code>robos.org</code>"]
        Svc["Services & Contracts<br/><code>robos.services</code>"]
        Apps["Applications<br/><code>robos.apps</code>"]
        DevOps["DevOps & Cloud<br/><code>robos.devops</code>"]
        Learn["eLearning<br/><code>robos.learning</code>"]
    end

    Org -->|Governs| Core
    Org -->|Owns| Svc
    Org -->|Builds| Apps
    Svc -->|Validates| Apps
    Apps -->|Deploys via| DevOps
    Core -->|Compiles with| DevOps
    Learn -->|Educates on| Svc
```

---

## The 6 Standard RobOS Package Stores

| Package ID | Namespace | Target Domain | Schemas & Shapes |
|---|---|---|---|
| **`core-platform`** | `robos.platform` | Foundational architectural graph, system roots, and platform configuration. | <code>robos:Project</code>, <code>robos:Epic</code>, <code>robos:BuildSystem</code> |
| **`organization`** | `robos.org` | People, developer profiles, team topologies, and cross-team communication channels. | <code>robos:Team</code>, <code>robos:GitProjectOrganization</code> |
| **`services`** | `robos.services` | Backend microservices, OpenAPI 3.1 specifications, gRPC reflection stubs, and BDD verification features. | <code>robos:Microservice</code>, <code>robos:Contract</code>, <code>oslc_rm:Requirement</code> |
| **`applications`** | `robos.apps` | Front-end SPAs, desktop workstations, PC & mobile games, mobile apps, and CLI tools. | <code>robos:DesktopApp</code>, <code>robos:ConsoleApp</code>, <code>robos:MobileApp</code>, <code>robos:DataPipeline</code>, <code>robos:Library</code>, <code>robos:FrontEndApp</code>, <code>robos:PCGame</code>, <code>robos:MobileGame</code> |
| **`devops`** | `robos.devops` | Cloud providers, CI/CD pipelines, container registries, OAuth apps, DNS domains, and secure GPG pass credentials. | <code>robos:RemoteExecutionCluster</code> |
| **`learning`** | `robos.learning` | Interactive developer courses, tutorials, and architectural training modules. | <code>robos:ELearning</code> |

---

## Automated Validation via SHACL

Every node in the Knowledge Graph is verified using programmatic SHACL validators before it can be merged into `.robos/knowledge-graph.jsonld` or deployed to production:

```javascript
const { SHACLValidator } = require('/usr/local/share/robos/robos-graph/lib/shacl-validator');
const { SDLCKnowledgeGraphStore } = require('/usr/local/share/robos/robos-graph');

const store = new SDLCKnowledgeGraphStore();
const validationResult = store.validate();

if (!validationResult.conforms) {
  console.error("SHACL Violations:", validationResult.violations);
} else {
  console.log("All graph nodes strictly conform to SHACL specifications.");
}
```

---

## Regenerating Schema Documentation

RobOS includes a built-in companion generator that keeps documentation in continuous lockstep with schema code:

```bash
# Run automated schema doc generator
node scripts/generate-kgraph-schema-docs.js
```