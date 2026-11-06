---
title: "RobOS Action Registry"
package: robos-action-registry
category: "libraries"
component_type: component
permalink: /robos-action-registry/
summary: "RobOS Action Registry — pluggable action type system for event-driven automation"
description: "RobOS Action Registry — pluggable action type system for event-driven automation"
---

RobOS Action Registry — pluggable action type system for event-driven automation


## Public interface

`index.js` exports `ActionRegistry`, `resolveTemplate` and `resolveParams`. The registry holds pluggable action types; the template helpers resolve their parameters.

The [rule engine](/robos-rule-engine/) uses actions when a rule matches an event. [Automation Studio](/automation-studio/) provides the editing interface.

## Source

Browse [`packages/robos-action-registry`](https://github.com/nddipiazza/robos/tree/main/packages/robos-action-registry) for implementation and exports.
