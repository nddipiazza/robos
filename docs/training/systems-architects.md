---
title: Systems Architects
layout: default
parent: Training
nav_order: 2
has_children: true
permalink: /training/systems-architects/
---

# Systems Architects: Dual-State Knowledge Graph Modeling
{: .no_toc }

Learn how to govern enterprise microservices, databases, and message brokers with compile-time semantic precision. Prevent breaking downstream changes before an autonomous agent writes a single line of code.
{: .fs-6 .fw-300 }

## Table of contents
{: .no_toc .text-delta }

1. TOC
{:toc}

---

## The Architectural Mission: "Taming The Citadel"

Every senior architect knows the sinking feeling of Friday afternoon: an engineer modifies a field in an internal microservice, passes their isolated unit tests, merges to production, and instantly takes down billing, user search, and warehouse fulfillment.

Why does this happen? **Because traditional architecture documentation is dead on arrival.**
- Architecture diagrams live in Confluence or Miro boards that rot the moment someone pushes an update.
- Transitive blast radiuses are invisible across multi-repository organizations.
- Autonomous coding agents blindly generate code without knowing whether an API schema was updated five minutes ago in a sister repository.

RobOS changes the paradigm entirely. In this track, you step into the role of **Chief Systems Architect** of **The Citadel**—a complex, distributed commerce platform. You will replace stale wikis with a **Dual-State Knowledge Graph** grounded in W3C Linked Data (Schema.org, OASIS OSLC, and SHACL constraint shapes).

<div style="margin: 2rem 0;">
  <img src="{{ '/assets/images/training/architects-blast-radius-diff.jpg' | relative_url }}" alt="Dual-State Knowledge Graph Semantic Blast Radius Diff" class="robos-zoomable-img" style="display: block; width: 100%; height: auto; border-radius: 8px; border: 1px solid #30363d;" />
  <p style="text-align: center; color: #8b949e; font-size: 0.85rem; margin-top: 0.5rem;"><em>Figure: Dual-State Knowledge Graph Semantic Blast Radius Diff comparing World 1 (Production main) with World 2 (Feature Branch).</em></p>
</div>

```mermaid
graph LR
    subgraph World1["World 1: Production (main)"]
        OS1["Order Service"] --> BS1["Billing Service v2.1"]
        BS1 --> SPG1["Stripe Gateway"]
        OS1 --> CDB1[("Customer DB")]
        BS1 --> AL1["Audit Log"]
        style BS1 fill:#164e63,stroke:#00e5ff,color:#fff
        style OS1 fill:#064e3b,stroke:#10b981,color:#fff
    end

    subgraph World2["World 2: Feature Branch"]
        OS2["Order Service"] --> BS2["Billing Service v2.2-draft<br/>(Modified Contract)"]
        BS2 -.->|"Breaking Change Alert"| OS2Impact["Order Service: Broken Contract"]
        BS2 -.->|"Schema Deprecation"| NWImpact["Notification Worker: Field Error"]
        style BS2 fill:#701a75,stroke:#f43f5e,color:#fff
        style OS2Impact fill:#7f1d1d,stroke:#ef4444,color:#fff
        style NWImpact fill:#78350f,stroke:#f59e0b,color:#fff
    end
```

---

## Architectural Principles of RobOS

Rather than viewing architecture as static drawings, RobOS treats your system topology as executable, queryable linked data:

| Conventional Approach | The RobOS Knowledge Graph Standard |
|:---|:---|
| **Stale Documentation**: Diagrams in Miro or Confluence drift from reality within days. | **Machine-Readable Truth**: Architecture is stored in versioned JSON-LD packages validated by W3C SHACL shapes. |
| **Silent Blast Radiuses**: Downstream breakage is discovered after production deployments fail. | **Pre-Flight Blast-Radius Diffing**: Compares World 1 (`main`) against World 2 (feature proposal) before implementation begins. |
| **Manual API Drifts**: Engineers manually adjust Swagger files after breaking code is written. | **Contract-First Code Generation**: Agents generate code strictly bounded by formal OpenAPI 3.1, Protobuf, and GraphQL contracts. |
| **Monolithic Silos**: System models are locked inside opaque enterprise repository wikis. | **Modular Namespaced Packages**: Distributed packages under `.robos/kgraphs/` indexed by `.robos/kgraph.yaml`. |

---

## Course Curriculum

<div class="rb-links" style="margin: 2rem 0;">
  <a class="rb-link" href="{{ '/training/systems-architects/01-living-graph-vs-dead-confluence.html' | relative_url }}">
    <div style="font-weight: 600; color: #00e5ff; font-size: 1.05rem; margin-bottom: 0.25rem;">
      01 - The Living Graph vs. Dead Confluence Diagrams
    </div>
    <div style="color: #8b949e; font-size: 0.9rem; line-height: 1.5;">
      Why static documentation fails, how Schema.org + OASIS OSLC JSON-LD turn architecture into compile-time verified system truth, and exploring the KGraph schema hierarchy.
    </div>
  </a>

  <a class="rb-link" href="{{ '/training/systems-architects/02-declarative-modeling-and-shacl-shapes.html' | relative_url }}">
    <div style="font-weight: 600; color: #00e5ff; font-size: 1.05rem; margin-bottom: 0.25rem;">
      02 - Declarative Modeling &amp; SHACL Shape Validation
    </div>
    <div style="color: #8b949e; font-size: 0.9rem; line-height: 1.5;">
      Domain modeling with Schema Studio, writing TypeSpec definitions, enforcing structural constraints with W3C SHACL shapes, and registering services and databases.
    </div>
  </a>

  <a class="rb-link" href="{{ '/training/systems-architects/03-dual-state-time-machine-and-blast-radius.html' | relative_url }}">
    <div style="font-weight: 600; color: #00e5ff; font-size: 1.05rem; margin-bottom: 0.25rem;">
      03 - The Dual-State Time Machine &amp; Semantic Blast Radius
    </div>
    <div style="color: #8b949e; font-size: 0.9rem; line-height: 1.5;">
      How to execute semantic diffs comparing World 1 (Production main) with World 2 (feature branches), tracing transitive dependencies, and guaranteeing zero breaking changes.
    </div>
  </a>
</div>

---

## The Citadel Architecture: Your Sandbox Playground

Throughout this track, you will interact with the reference architecture of **The Citadel**:
- **Services**: `orders-api`, `billing-api`, `inventory-worker`, `customer-gateway`.
- **Databases**: PostgreSQL relational database (`citadel-core-db`), MongoDB document store (`audit-events`), Redis cache (`session-store`).
- **Brokers & Contracts**: Apache Kafka topic (`order-events.v1`), OpenAPI 3.1 REST contracts, and gRPC Protobuf definitions.

Ready to declare war on stale documentation? Proceed to **[The Living Graph vs. Dead Confluence Diagrams]({{ '/training/systems-architects/01-living-graph-vs-dead-confluence.html' | relative_url }})**!
