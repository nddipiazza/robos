---
title: "RobOS Dashboards"
package: robos-dashboards
category: "core-desktop"
icon: robos-dashboards.svg
summary: "Create KGraph graphical dashboards from card layouts where each widget is any RobOS component, embeddable via <robos-dashboard> and castable to Smart TVs"
description: "Create KGraph graphical dashboards from card layouts where each widget is any RobOS component, embeddable via <robos-dashboard> and castable to Smart TVs"
---

# RobOS Dashboards

**RobOS Dashboards** (`packages/robos-dashboards`) is a graphical dashboard studio and embeddable component library built on the RobOS Knowledge Graph (`.robos/kgraphs/dashboards/package.jsonld`).

## Highlights

- **Composable RobOS Component Widgets**: Every dashboard widget is a RobOS custom element (`<robos-widget-git-commits>`, `<robos-widget-calendar-today>`, `<robos-widget-agent-sessions>`, `<robos-widget-smart-tv>`, `<robos-widget-smart-lights>`, `<robos-widget-kgraph>`, `<robos-widget-sprint-radar>`, or any `<robos-...>` component) that can display any RobOS-powered data source.
- **Embeddable `<robos-dashboard>` Library (`packages/robos-ui/robos-dashboard.js`)**: Embed any KGraph dashboard or individual widget card inside any RobOS desktop app or web portal.
- **KGraph Card Layouts (`robos:DashboardLayout`)**: Switch any dashboard between canonical layouts (`Mission Control 3-Column`, `Hero Top + 2-Card Split`, `Sidebar Focus 1/3 + 2/3`, `Quad 2×2 Card Grid`, `10-Foot Smart TV Wallboard`, `Single Full-Canvas Card`).
- **Pre-Built Daily Engineering & Agent Ops Dashboard**:
  1. **10 Latest Commit Messages** in a compact, small, readable text list format (`<robos-widget-git-commits>`)
  2. **Calendar Events for the Day** synced with RobOS Google Calendar / Thunderbird CalDAV (`<robos-widget-calendar-today>`)
  3. **Running RobOS Agent Sessions** with their live status lines tailed (`<robos-widget-agent-sessions>`)
- **RobOS Smart TV Studio Cast (`:19210/dashboard`)**: Show any dashboard on a paired Roku OS, LG webOS, Samsung Tizen, or Google TV / Android TV directly from RobOS Dashboards or RobOS Smart TV Studio.
