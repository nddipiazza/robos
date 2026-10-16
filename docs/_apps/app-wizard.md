---
title: "RobOS Create Project & App Wizard"
package: app-wizard
category: arch-planning
icon: app-wizard.svg
summary: "Scaffold a new project from an archetype, or import an existing folder, and register it in the RobOS project files."
description: "App Wizard writes starter code for a web app, desktop app, CLI or service, or inspects an existing codebase and adds a Backstage catalog file and dev-setup.sh. Both paths register the project in RobOS."
---

App Wizard has two modes, switched at the top of the window: **Create New Project** and **Import Existing Code**. A **Simple Mode** / **Advanced Mode** toggle hides or shows the engineering fields (technology stack, custom domain, team ownership). Step-by-step walkthroughs are on [New app wizard]({{ '/new-app-wizard.html' | relative_url }}) and [Import an existing app]({{ '/app-import-wizard.html' | relative_url }}).

## Create a new project

The steps are **What to Build**, **Project Basics**, **Features & Data** and **Review & Create**.

1. Choose an archetype: Modern Website / Web App, Desktop Application, Backend Cloud API, Command-Line Utility, PC Video Game, Mobile Phone App, Data Worker / Sync, or Reusable Code Library. Four one-click presets (Urban Plant Tracker, Barista Order API, DocuVault Desktop, Pulse Metrics CLI) pre-fill the form.
2. Enter a project name. The folder name under `packages/` is derived from it and must be lowercase letters, digits and hyphens.
3. Pick how it stores data and where it runs, then review and create.

What gets written depends on the archetype:

| Archetype | Generated code |
|---|---|
| Web app (also any project whose deploy target is Vercel or whose stack mentions Next.js) | Copy of the `nextjs-vercel-web` template in `packages/app-wizard/templates` |
| Desktop app | Electron `package.json` and `main.js` with the RobOS window flags |
| Command-line utility | `package.json`, `bin/cli.js`, `README.md`, `Dockerfile` |
| Everything else, including API, game, mobile, pipeline and library | A small Node HTTP service: `server.js` with a `/health` route, `openapi.yaml`, `Dockerfile`, `README.md` |

For every archetype the wizard also writes `catalog-info.yaml` (a Backstage descriptor) and an executable `dev-setup.sh`, then registers the project:

- appends an entry to `.robos/packages.yaml` if that file exists;
- adds a node to `.robos/kgraphs/services/package.jsonld` (APIs) or `.robos/kgraphs/applications/package.jsonld` (everything else);
- creates `docs/projects/<slug>.md` if the `docs/projects` folder exists;
- adds the project to `~/.config/robos/git-projects.json`, so it shows up in [Git Projects]({{ '/apps/git-projects/' | relative_url }}).

The target is `packages/<slug>` under the RobOS checkout, found by walking up from the working directory until a `.robos` folder appears.

## Import existing code

The steps are **What to Import**, **Deep Inspection** and **Catalog & Ingest**. You give a folder path (the box offers path completion). **Deep Inspect & Analyze Targets** looks at files in the top level of that folder and guesses the archetype: `pom.xml` (Java, Spring Boot), `package.json` with Electron, React Native, a front-end framework or Express, `project.godot` or `*.uproject`, `go.mod`, `Cargo.toml`, `requirements.txt` or `pyproject.toml`. It also notes an existing `Dockerfile`, `dev-setup.sh`, `catalog-info.yaml`, and OpenAPI, GraphQL or `.proto` files. Frameworks for Go and Python are assumed (Gin, FastAPI), not detected, so check the result and edit it.

**Synthesize Backstage Catalog & Ingest** and **Complete Ingestion & Map** then write `catalog-info.yaml` and `dev-setup.sh` into the folder when they are missing (the generated `dev-setup.sh` only prints a message), append to `.robos/packages.yaml`, and add the folder to `git-projects.json`. A text box lets you correct the guess in words ("mobile game", "front end"); that is keyword matching in `main.js`, not a model. Through **+ Add Resource** the wizard can also take other resource types (Git repository or organization, local directory, Confluence space, Backstage catalog, S3 bucket, database, Kafka, Kubernetes cluster, MCP server) and import them into `.robos/knowledge-graph.jsonld` with SHACL validation.

## Notes

- No network access or tokens are needed. Generated web apps expect Node and, for deploys, a Vercel account.
- The wizard edits files in your checkout. Commit or stash first so you can see what it changed.
- The wizard has no field for the repository URL. New projects are registered with `github.com/nddipiazza/<slug>` and imported ones with `github.com/acme/<slug>`, so correct the entry in `.robos/packages.yaml`.

Source: [`packages/app-wizard`](https://github.com/nddipiazza/robos/tree/main/packages/app-wizard).
