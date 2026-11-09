---
title: "RobOS Adapters"
package: robos-adapters
category: "libraries"
component_type: component
permalink: /robos-adapters/
redirect_from:
  - /apps/robos-adapters/
summary: "RobOS Open-Source Ecosystem Adapter Suite (Backstage, TypeSpec, Buf, Pact, Devcontainers)"
description: "RobOS Open-Source Ecosystem Adapter Suite (Backstage, TypeSpec, Buf, Pact, Devcontainers)"
---

RobOS Open-Source Ecosystem Adapter Suite (Backstage, TypeSpec, Buf, Pact, Devcontainers)


## Available adapters

`index.js` exports `BackstageAdapter`, `TypeSpecAdapter`, `BufAdapter`, `PactAdapter` and `DevcontainerAdapter`. `createAdapters()` returns instances keyed by `backstage`, `typespec`, `buf`, `pact` and `devcontainer`.

The implementations live in `lib/`. Follow the adapter for the format you are integrating, and use [Schema Studio](/schema-studio/) or [Contract Studio](/contract-studio/) for the corresponding desktop workflow.

## Source

Browse [`packages/robos-adapters`](https://github.com/nddipiazza/robos/tree/main/packages/robos-adapters) for implementation and exports.
