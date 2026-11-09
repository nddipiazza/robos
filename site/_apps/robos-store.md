---
title: "RobOS Store"
package: robos-store
category: "libraries"
component_type: component
permalink: /robos-store/
redirect_from:
  - /apps/robos-store/
summary: "RobOS Distributed Config Store — git-backed, versioned, team-shared configuration"
description: "RobOS Distributed Config Store — git-backed, versioned, team-shared configuration"
---

RobOS Distributed Config Store — git-backed, versioned, team-shared configuration


## Store and sync configuration

`index.js` exports `RobosStore`, `GitBackend` and `SchemaValidator`. A store is configured with a repository URL and local checkout path, then initialized with `init()`.

The store exposes `get`, `set`, `delete`, `list`, `history`, `sync` and `diff`. `set()` validates values when a matching schema is registered. The Git backend versions changes and synchronizes the shared configuration repository.

For backing up and moving a personal RobOS setup, see [Config management](/config-management/).

## Source

Browse [`packages/robos-store`](https://github.com/nddipiazza/robos/tree/main/packages/robos-store) for implementation and exports.
