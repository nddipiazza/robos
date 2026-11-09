---
title: "RobOS Event Bus"
package: robos-event-bus
category: "libraries"
component_type: component
permalink: /robos-event-bus/
redirect_from:
  - /apps/robos-event-bus/
summary: "RobOS Event Bus — Unix domain socket pub/sub with NDJSON protocol"
description: "RobOS Event Bus — Unix domain socket pub/sub with NDJSON protocol"
---

RobOS Event Bus — Unix domain socket pub/sub with NDJSON protocol


## Public interface

`index.js` exports `EventBus`, `EventBusClient`, `generateId` and the event-category helpers `getCategory`, `getKnownTypes` and `getCategories`.

The bus communicates over Unix domain sockets using newline-delimited JSON. `event-bus.js` implements the bus, `client.js` implements its client, and `category-map.js` defines event categories.

See the [rule engine](/robos-rule-engine/) and [scheduler](/robos-scheduler/) for consumers of this event system.

## Source

Browse [`packages/robos-event-bus`](https://github.com/nddipiazza/robos/tree/main/packages/robos-event-bus) for implementation and exports.
