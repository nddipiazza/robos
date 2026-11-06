---
title: "RobOS UI"
package: robos-ui
category: "libraries"
component_type: component
permalink: /robos-ui/
summary: "RobOS UI Component Library — reusable Web Components for RobOS Electron apps"
description: "RobOS UI Component Library — reusable Web Components for RobOS Electron apps"
---

RobOS UI Component Library — reusable Web Components for RobOS Electron apps


## Use the shared UI

Load `robos-ui.js` from an app renderer to register its reusable custom elements. These include `<robos-ai-textarea>`, `<robos-person-selector-textbox>` and `<robos-question-wizard>`. Additional elements live in `robos-voice-button.js`, `robos-dashboard.js`, `reviewer-picker.js` and `agent-discussion.js`.

Keep privileged work in the Electron main process and expose it through the preload bridge. Agent actions should use the shared [agent client](/robos-agent-client/) and [runtime helpers](/robos-lib/).

See [RobOS Dashboards](/robos-dashboards/) for composing widgets with `<robos-dashboard>`.

## Source

Browse [`packages/robos-ui`](https://github.com/nddipiazza/robos/tree/main/packages/robos-ui) for implementation and exports.
