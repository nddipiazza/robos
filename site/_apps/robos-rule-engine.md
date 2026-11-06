---
title: "RobOS Rule Engine"
package: robos-rule-engine
category: "libraries"
component_type: component
permalink: /robos-rule-engine/
summary: "RobOS Rule Engine — event-driven rule matching and action execution"
description: "RobOS Rule Engine — event-driven rule matching and action execution"
---

RobOS Rule Engine — event-driven rule matching and action execution


## Matching events to actions

`index.js` exports `RuleEngine`, `evaluateCondition`, `evaluateConditions`, `operators`, `getField` and `DEFAULT_RULES`.

`conditions.js` evaluates rule conditions; `defaults.js` contains the built-in rules. The engine connects the [event bus](/robos-event-bus/) to actions from the [action registry](/robos-action-registry/). [Automation Studio](/automation-studio/) is the desktop interface.

## Source

Browse [`packages/robos-rule-engine`](https://github.com/nddipiazza/robos/tree/main/packages/robos-rule-engine) for implementation and exports.
