---
title: "Dev Tools MCP Server"
package: dev-tools-mcp
category: services
summary: "An MCP server with a small catalog of developer CLI tools; \"install\" and \"check\" read and write a JSON file and do not touch the system."
description: "dev-tools-mcp exposes four robos_devtools_* tools over a six-entry catalog stored in ~/.config/robos/devtools/tools.json. It does not run installers or detect real binaries."
icon: dev-tools-mcp.svg
---

This package is an MCP server plus a console window. The idea is that an agent can ask what tooling a machine has and request more. The current code keeps a catalog file and nothing more.

{: .important }
`robos_devtools_install` sets `installed: true` on a catalog entry and replies "Successfully provisioned". It does not download or run anything. `robos_devtools_check` reports the flag in the file, not whether the binary is on your `PATH`.

## Tools and resources

| Tool | What it does |
|---|---|
| `robos_devtools_list` | Returns the whole catalog with each entry's `installed` flag and version |
| `robos_devtools_check` | Looks up one tool id; reports "not in the RobOS tool catalog" for unknown ids |
| `robos_devtools_install` | Marks a tool installed. An unknown id is added as a "Custom CLI" entry at version `1.0.0` |
| `robos_devtools_uninstall` | Marks a tool not installed; errors on an unknown id |

Resources: `robos://dev-tools-mcp/devtools/installed` and `robos://dev-tools-mcp/devtools/available`.

The default catalog has Docker Engine, Kubernetes CLI (`kubectl`), GitHub CLI (`gh`), K9s, HashiCorp Terraform and AWS CLI v2. Docker, `kubectl`, `gh` and K9s start as installed, with the version numbers written in `server.js`.

## Console window

The window title is "RobOS Dev Tools MCP Server Console". It shows counters (installed, catalog size, tools, pending), the tool registry, quick buttons (**Check Docker**, **Install Terraform**) and a **Live Dev Tools MCP Protocol Trace** with **Clear Trace**. It calls the service over Electron IPC.

## Data and registration

- Catalog: `~/.config/robos/devtools/tools.json`, written on first run.
- On start the server records its tool and resource names in `~/.config/robos/mcp/servers.json` under the id `devtools`. It opens no port unless a `port` option is passed.

```bash
electron packages/dev-tools-mcp
```

`npm test` in the package runs `node --test`. Source: [`packages/dev-tools-mcp`](https://github.com/nddipiazza/robos/tree/main/packages/dev-tools-mcp).
