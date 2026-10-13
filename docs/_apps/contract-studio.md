---
title: "Contract Studio"
package: contract-studio
category: apis-testing
summary: "A prototype console for browsing OpenAPI and AsyncAPI contracts and running Spectral, Pact and mock-server steps; the results are scripted samples."
description: "Contract Studio shows three built-in Acme Petshop contracts. Spectral, Pact and Prism results are fixed values, and no linter, test runner or mock server is started."
---

Contract Studio is a mock-up of an API governance console. It is wired to one sample project, `acme-petshop-platform`, and does not yet inspect your own contracts.

{: .important }
The contract list, operations, "0 errors" Spectral result, "14/14" Pact result and the Prism "port 4010" are constants in `main.js`. The buttons return them without running Spectral, Pact or Prism. The AI assistant box answers every prompt with the same canned message.

## What is on screen

- A header with a branch selector (`main` or `feature/PET-105-rabies-verification`, which only changes the commit label) and the buttons **Run Spectral Lint**, **Run Pact Tests** and **Start Prism Mock**.
- The **Contract Registry**, a searchable list of three sample contracts: `petstore-api.openapi.yaml`, `vaccine-gateway.openapi.yaml` (both OpenAPI 3.1) and `events.asyncapi.yml` (AsyncAPI 3.0).
- **Contract Operations & Verification Gates** for the selected contract: its endpoints or topics with security and response codes, and the three gate buttons.
- An **AI Contract Authoring & Governance Assistant** prompt box.

![Contract Studio with the contract registry on the left and the governance gates for petstore-api.openapi.yaml on the right]({{ '/assets/images/screenshots/acme-petshop-step3-studio_open_frame.png' | relative_url }})
{: .robos-zoomable-img }

*The registry (left) and the Spectral, Pact and Prism gates for the first sample contract (right).*

## The only real data

The raw YAML view reads `petstore-api.openapi.yaml` and `vaccine-gateway.openapi.yaml` from `~/.robos/projects/acme-petshop-platform/contracts/` when those files exist, and falls back to a three-line stub otherwise. The home directory can be overridden with `REAL_HOME` or `ROBOS_HOST_HOME`.

## Running it

```bash
electron packages/contract-studio
```

No Docker, network access or tokens are needed. Source: [`packages/contract-studio`](https://github.com/nddipiazza/robos/tree/main/packages/contract-studio).
