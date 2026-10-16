---
title: "Automation Studio"
package: automation-studio
category: arch-planning
icon: automation-studio.svg
summary: "Editor for event rules and cron-style scheduled jobs, plus a viewer for the daily event log."
description: "Automation Studio saves rules and jobs as JSON files under ~/.config/robos and shows the event log. Nothing in the repository executes the saved rules or jobs yet."
---

Automation Studio has three tabs: **Rules**, **Scheduled Jobs** and **Event Log**.

{: .warning }
The studio only edits and displays data. `packages/robos-rule-engine` and `packages/robos-scheduler` are libraries that can run rules and cron jobs, but no app or service in the repository loads them outside tests. The rule shape the studio saves (a flat `eventType`) also differs from the `trigger.eventType` shape the rule engine reads. Treat saved rules and jobs as configuration that is not executed today.

## What you do in it

- **Rules**: click **+ New Rule**, give it a name, choose an event type, add conditions and actions, and click **Save Rule**. The event types in the list are `ci.build.completed`, `ci.build.failed`, `pr.opened`, `pr.merged`, `pr.review.requested`, `issue.created`, `issue.assigned`, `deploy.started`, `deploy.completed`, `deploy.failed`, `git.push` and `agent.task.completed`. Each action has a type (Notify, Webhook, Execute or Log) and a free-text parameter field. A checkbox on each row enables or disables the rule.
- **Scheduled Jobs**: click **+ New Job**, enter a name, a cron expression and actions. The list shows a readable form of simple schedules (for example "Daily at 9:00", "Every hour at :05"); more complex expressions are shown as typed. A checkbox enables or disables a job. **Run Now** only stamps the job with a last-run time and the status `ran`; it does not run the actions. Rows also have **Edit** and **Del**.
- **Event Log**: shows one day of events. Filter by type (CI, PR, Issue, Deploy, Git, Agent) and category (Build, Review, Deploy, Task). The view refreshes every five seconds; **Pause** (which becomes **Resume**) stops that, and **Refresh** reloads on demand.

## Where the data lives

| File | Contents |
|---|---|
| `~/.config/robos/event-rules.json` | The rules list. |
| `~/.config/robos/scheduled-jobs.json` | The jobs list. |
| `~/.config/robos/event-log/YYYY-MM-DD.jsonl` | One JSON event per line. The studio reads these; the `robos-event-bus` library writes them. |

The files are created on the first save. Without a writer for the event log, the **Event Log** tab is empty.

Run it with `electron packages/automation-studio`. Source: [`packages/automation-studio`](https://github.com/nddipiazza/robos/tree/main/packages/automation-studio).
