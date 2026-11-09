---
title: "RobOS Scheduler"
package: robos-scheduler
category: "libraries"
component_type: component
permalink: /robos-scheduler/
redirect_from:
  - /apps/robos-scheduler/
summary: "RobOS Scheduler — cron-based and event-triggered job scheduling"
description: "RobOS Scheduler — cron-based and event-triggered job scheduling"
---

RobOS Scheduler — cron-based and event-triggered job scheduling


## Cron and event schedules

`index.js` exports `CronScheduler`, `EventScheduler`, `parseField`, `parseCron`, `matchesCron` and `nextRun`.

Use `cron-scheduler.js` for time-based jobs, `event-scheduler.js` for event-triggered jobs, and `cron-parser.js` for parsing expressions and calculating the next run. Event schedules connect to the [event bus](/robos-event-bus/).

## Source

Browse [`packages/robos-scheduler`](https://github.com/nddipiazza/robos/tree/main/packages/robos-scheduler) for implementation and exports.
