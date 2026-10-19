---
title: "System Topology Studio"
package: topology-manager
category: arch-planning
summary: "Prototype C4-style canvas that shows a built-in sample system (Acme Petshop). Backstage import and C4 export return canned results."
description: "Shows a sample topology with L1, L2 and L3 views, a node inspector, and buttons for Backstage import, C4 export and adding a data source. It does not read your Backstage catalog or your services yet."
icon: topology-manager.svg
---

System Topology Studio is a prototype. The window shows one hard-coded example system, "Acme Petshop Platform", so you can see how a topology canvas could look. It does not discover your architecture.

## What you see

- **Header:** the view switch **L1 Context**, **L2 Containers**, **L3 Components** and **Live OTel**, plus the buttons **Add Data Source**, **Import Backstage** and **Export C4**.
- **AI Architecture & C4 Topology Synthesis:** a prompt box and a short two-question form. Completing it loads the six sample nodes (web client, REST API, shared library, vaccine gateway, Kafka event bus, PostgreSQL) and their links. The answers do not change the result.
- **Backstage Catalog:** a list of the nodes, searchable.
- **Canvas and Node & Contract Inspector:** click a node to see its fields. The "live traffic" numbers on the canvas are random values generated in the browser, not telemetry.

## What the buttons do

| Button | Behavior today |
|---|---|
| **Import Backstage** | Ignores any `catalog-info.yaml` and adds one fixed sample node ("Acme Tax Calculation API"). |
| **Export C4** | Shows a fixed PlantUML C4 container diagram of the sample system, not a diagram of the current canvas. |
| **Add Data Source** | Writes `packages/kube-studio/manifests/petshop-baseline/04-analytics-postgres.yaml` (a Deployment and Service for `postgres:16-alpine` with a default `postgres` password) and adds a sample entry to `~/.config/robos/db-manager-connections.json`. Both use fixed example values. |

When the sample topology is loaded it is saved as JSON text to `~/.robos/projects/acme-petshop-platform/.robos/topology.yaml`, and read back from there the next time. The path is fixed in `main.js`.

{: .note }
The Add Data Source button changes files in the repository checkout and in your RobOS config folder. It generates plain Kubernetes YAML, not a Helm chart.

## Run it

The package has no `.desktop` launcher. Run `npm start` in `packages/topology-manager`.
