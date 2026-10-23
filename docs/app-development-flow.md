---
title: Building apps
layout: default
parent: Build on RobOS
nav_order: 3
has_children: true
permalink: /app-development-flow.html
---

# Building apps
{: .no_toc }

Two different tasks are called "building an app" in RobOS: starting an application project of your own, and adding an app to the RobOS desktop suite. This page tells you which tool does which and what to run next.
{: .fs-6 }

{: .tip }
To take an app from a plan to merged pull requests with Task Planner, Task Implementer and Agent Code Review, follow the Build apps guides on rowbose.com: [on your own](/build-apps/solo/) or [as a team](/build-apps/teams/).

## Start a project of your own

The App Wizard (`packages/app-wizard`) is the entry point. It has two modes, selected by the **Create New Project** and **Import Existing Code** buttons in its header.

| You have | Use | What it does |
|:---|:---|:---|
| Nothing yet | [New app wizard]({{ site.baseurl }}{% link new-app-wizard.md %}) | Writes a starter project to `packages/<slug>/` and registers it. |
| A codebase on disk, or a list of repositories | [Import an existing app]({{ site.baseurl }}{% link app-import-wizard.md %}) | Detects the archetype, writes missing `catalog-info.yaml` and `dev-setup.sh` files, and adds graph nodes. |
| A web app | [Front-end apps]({{ site.baseurl }}{% link frontend-applications.md %}) | The Next.js template the wizard generates, and the graph shape for front-end apps. |
| A game | [Game development]({{ site.baseurl }}{% link game-development.md %}) | What the repository contains for games, and what the wizard does not do for them. |

Open the wizard from the App Launcher, or run it from a RobOS checkout:

```bash
electron packages/app-wizard
```

Both modes look for a `.robos` directory in the process's working directory and up to four parent directories, and write there. Start the wizard from inside the repository whose knowledge graph you want to update; if it finds no `.robos`, it uses the working directory. The app page is at [App Wizard]({{ '/apps/app-wizard/' | relative_url }}).

## Work on the project with other RobOS apps

These apps read the same files and graph the wizard writes. Each has its own page; the one-line descriptions come from the apps' `package.json` files.

| App | Use it for |
|:---|:---|
| [Task Planner]({{ '/apps/task-planner/' | relative_url }}) | Creating tasks on your task server from an AI prompt. |
| [Topology Studio]({{ '/apps/topology-manager/' | relative_url }}) | Managing the system topology and the Backstage C4 catalog. |
| [Git Projects]({{ '/apps/git-projects/' | relative_url }}) | Cloning, managing and launching git repositories. |
| [PR Review]({{ '/apps/pr-review/' | relative_url }}) | Reviewing a pull request in RobOS, or opening it in IntelliJ IDEA (**Review in IntelliJ**) or VS Code (**Review in VS Code**). |
| [REST API Client]({{ '/apps/rest-client/' | relative_url }}) | Running Bruno-compatible request collections. |
| [Kube Studio]({{ '/apps/kube-studio/' | relative_url }}) | Browsing Kubernetes clusters. |
| [Deploy Tracker]({{ '/apps/deploy-tracker/' | relative_url }}) | Tracking deployment history and frequency. |

The full list is on [Apps]({{ site.baseurl }}{% link apps.md %}).

## Add an app to the RobOS suite

Apps in the suite are Electron apps under `packages/<app-id>/`. Use the `create-robos-app` skill instead of copying an existing app by hand. Run it with the app name, for example "Dev Central". It creates these files and then walks through registering the app:

| File | Purpose |
|:---|:---|
| `package.json`, `main.js` | Electron main process. |
| `preload.js` | Exposes the app's methods to the renderer with `contextBridge`. |
| `renderer/index.html`, `renderer/app.js`, `renderer/style.css` | The window. |
| `icon.svg` | The app icon. |
| `<app-id>.desktop` | The launcher entry. It needs `X-RobOS-App=true` for the App Launcher to list the app. |

Then:

1. Run the app with `electron packages/<app-id>`.
2. Read its UI as text without a screenshot: `node packages/robos-lib/snapshot-cli.js <app-id> --text`. The app must call `startDebugServer` on the port registered for it in `PORT_REGISTRY` in `packages/robos-lib/snapshot-cli.js`. `--json` and `--screenshot` are also available.
3. Run the suite's tests in Docker with `./scripts/e2e-container.sh`. This needs Docker; `--build` rebuilds the image and `-i` opens a shell in the container.
4. Create the app's docs page with `node scripts/sync-app-docs.js`. It adds a file to `docs/_apps/` for every app that has none.
5. To try the app on the RobOS VM, use the `deploy-to-vm` skill. The VM accepts SSH on port 2224.

See [Skills]({{ site.baseurl }}{% link robos-skills.md %}) for how skills are installed and run, and [Architecture]({{ site.baseurl }}{% link architecture.md %}) for how the pieces fit together.
