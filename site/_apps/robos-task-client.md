---
title: "RobOS Task Client"
package: robos-task-client
category: "libraries"
component_type: component
permalink: /robos-task-client/
summary: "RobOS Task Client — unified adapter for Jira, GitHub Issues, and other task servers"
description: "RobOS Task Client — unified adapter for Jira, GitHub Issues, and other task servers"
---

RobOS Task Client — unified adapter for Jira, GitHub Issues, and other task servers


## Task-server adapters

`createAdapter(serverConfig)` selects `JiraAdapter` or `GitHubAdapter` from `serverConfig.type`. Unsupported types raise an error.

The entry point also exports work-item hierarchy and progress helpers, `workItemLink`, `SyncEngine`, and mappings between RobOS and external task states. The adapter implementations live in `jira-adapter.js` and `github-adapter.js`.

Configure accounts in [Task Servers](/task-servers/), then plan issues in [Task Planner](/task-planner/).

## Source

Browse [`packages/robos-task-client`](https://github.com/nddipiazza/robos/tree/main/packages/robos-task-client) for implementation and exports.
