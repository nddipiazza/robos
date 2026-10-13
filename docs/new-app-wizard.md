---
title: New app wizard
layout: default
parent: Building apps
grand_parent: Build on RobOS
nav_order: 1
---

# New app wizard
{: .no_toc }

How to create a starter project with the App Wizard (`packages/app-wizard`): what each step asks, which template you get, which files it writes, and where it stops short. Read this before you rely on it for anything other than a web app, a desktop app or a command-line tool.
{: .fs-6 }

<details open markdown="block">
  <summary>On this page</summary>
  {: .text-delta }
1. TOC
{:toc}
</details>

## Run the wizard

Open **RobOS Create Project & App Wizard** from the App Launcher, or run it from a RobOS checkout:

```bash
electron packages/app-wizard
```

Click **Create New Project** in the header. The wizard writes to `packages/<slug>/` under the nearest `.robos` directory (the working directory or up to four parents; see [Building apps]({{ site.baseurl }}{% link app-development-flow.md %})). The generated projects need Node.js 20 or later. The app page is [App Wizard]({{ '/apps/app-wizard/' | relative_url }}).

The header also has a **Simple Mode** and **Advanced Mode** toggle. Advanced Mode adds three fields and a contract editor, described below.

![Decision flowchart: a new app is scaffolded across archetypes, an existing codebase is imported with AI refinement, and both generate catalog-info.yaml and dev-setup.sh and register in packages.yaml]({{ '/assets/images/app-flow-scaffolding-ingestion.jpg' | relative_url }}){: .robos-zoomable-img loading="lazy" }
*Concept diagram from the original design docs. The text on this page says what is built today.*

## The four steps

The sidebar shows the steps: What to Build, Project Basics, Features & Data, Review & Create.

![Four-column flow from project archetype presets through plain-English configuration and a scaffolding engine to registration in the knowledge graph, Backstage catalog, packages.yaml and living documentation]({{ '/assets/images/app-wizard/create_project_architecture.jpg' | relative_url }}){: .robos-zoomable-img loading="lazy" }
*Concept diagram from the original design docs. The text on this page says what is built today.*

| Step | What you do |
|:---|:---|
| What to Build | Pick one card: Modern Website / Web App, Desktop Application, Backend Cloud API, Command-Line Utility, PC Video Game, Mobile Phone App, Data Worker / Sync, or Reusable Code Library. Four starter buttons above the cards (Urban Plant Tracker, Barista Order API, DocuVault Desktop, Pulse Metrics CLI) fill in the form fields and jump to step 2. |
| Project Basics | Set **Project Name**, **Folder Name on Computer** (filled in from the name, lowercase with hyphens, prefixed `packages/`), **What does this project do?**, **Catchy Tagline**, **How will it save data?**, **Where will it run?** and **Project Team Owner**. The team list comes from `.robos/teams.yaml`; if that file has no teams, three built-in sample teams are shown. Advanced Mode adds **Technology Stack & Runtime**, **Custom Domain Name (Optional)** and **Search Keywords**. |
| Features & Data | Simple Mode shows a fixed list of what the project includes. Advanced Mode shows a **Specification Format** menu (Next.js routes, OpenAPI 3.1, TypeSpec, Protobuf, GraphQL) and a **Raw Contract Preview** editor. |
| Review & Create | Shows a summary card. **Create Project Now** writes the files and prints a log in the console box below the card. |

The folder name must be 2 to 61 characters of `a-z`, `0-9` and `-`, starting with a letter or digit. Anything else fails with "A lowercase slug (a-z, 0-9, -) is required."

Choosing a card changes the defaults for some archetypes only. Desktop Application sets the stack to Electron 29 and **Where will it run?** to Local Workstation / Linux. Backend Cloud API sets Node.js 20 / TypeScript / Express and Docker Container. Command-Line Utility sets Local Workstation / Linux. Modern Website / Web App sets Next.js 15 and Cloud Hosting (Vercel / Web). The other four cards leave the settings alone.

## What gets generated

The generator (`packages/app-wizard/lib/generate-app.js`) picks one template. It checks these conditions in order:

| Condition | Template | Files |
|:---|:---|:---|
| **Where will it run?** is Cloud Hosting (Vercel / Web), or the stack contains "Next.js" or "Vercel", or the archetype is Front End App | Next.js launch kit | A full Next.js project; see [Front-end apps]({{ site.baseurl }}{% link frontend-applications.md %}). |
| Archetype is Desktop Application | Electron app | `package.json`, `main.js`, `preload.js`, `renderer/index.html`, `renderer/app.js`, `renderer/styles.css`, `<slug>.desktop`, `README.md`, `Dockerfile` |
| Archetype is Command-Line Utility | Node.js CLI | `package.json`, `bin/cli.js` (with `status`, `ping` and `report` commands), `README.md`, `Dockerfile` |
| Anything else | Node.js HTTP service | `package.json`, `server.js` (serves `/api/health` and returns sample JSON for other `/api/` paths), `openapi.yaml`, `Dockerfile`, `README.md` |

Every template also gets `catalog-info.yaml` (a Backstage component descriptor) and an executable `dev-setup.sh`. The script checks for `node` and `git`, runs `npm install` and, for the web template, copies `.env.example` to `.env.local`, installs the Playwright browser and runs `npm test`.

{: .warning }
The Where will it run? menu starts on Cloud Hosting (Vercel / Web), and the Advanced Mode stack menu starts on Next.js 15. The PC Video Game, Mobile Phone App, Data Worker / Sync and Reusable Code Library cards change neither, so by default they produce the Next.js web template. If you change both settings you get the generic Node.js HTTP service instead. Neither is a game, mobile, pipeline or library scaffold; none exists yet.

### What changes the output

| Setting | Effect |
|:---|:---|
| Project Name, Folder Name, description, tagline, keywords, domain | Used in the generated files. Keywords are used only by the web template. The domain defaults to `<slug>.com`. |
| Project Team Owner | Becomes the `owner` under `spec` in `catalog-info.yaml`, and `author` in the desktop `package.json`. |
| Technology Stack & Runtime | Only decides the web-template check above, and is recorded in registration files. |
| How will it save data? | Not used. The web template always uses Neon Postgres, with PGlite locally. |
| Specification Format and Raw Contract Preview | Not used. The HTTP-service template always writes the same `openapi.yaml`. |

## What is registered

After writing files the generator also updates these. A target that does not exist is skipped silently.

| Target | Change |
|:---|:---|
| `.robos/packages.yaml` | Appends an entry with the URN, title, archetype, `repository` and technology (if the file exists). |
| `.robos/kgraphs/<package>/package.jsonld` | Adds a node for projects that get the web template, and for Desktop Application, Backend Cloud API and Command-Line Utility projects (if the package file exists). The package is `services` for a Backend Cloud API and `applications` for the others. Nothing is added for the other archetypes. |
| `docs/projects/<slug>.md` | Creates a project page if `docs/projects/` exists and the page does not. |
| `~/.config/robos/git-projects.json` | Appends an entry. See the note below. |

The repository is always `nddipiazza/<slug>`, because the wizard has no repository field. It appears as the `github.com/project-slug` annotation in `catalog-info.yaml` and as `repository` in `.robos/packages.yaml` and the graph node. Edit it after generation.

{: .note }
Git Projects stores its list as `{ "projects": [...] }` in `git-projects.json`, while the wizard reads and writes the file as a bare array. If Git Projects has already created the file, the wizard's entry is skipped. If the wizard creates the file first, Git Projects will not list the project. Add the repository in [Git Projects]({{ '/apps/git-projects/' | relative_url }}) yourself.

`catalog-info.yaml` and `dev-setup.sh` are written every time, so re-running the wizard for an existing folder overwrites them. The Electron, CLI and HTTP-service templates overwrite their files too. Only the Next.js template skips files that already exist.

## Generate without the GUI

The generator is plain Node.js and does not need Electron. This example writes to a scratch folder; run it from a RobOS checkout:

```bash
mkdir -p /tmp/robos-demo/.robos
node -e "
const { generateNewApp } = require('./packages/app-wizard/lib/generate-app');
const r = generateNewApp(
  { name: 'Pulse Metrics', slug: 'pulse-metrics', archetype: 'robos:ConsoleApp',
    technology: 'Node.js 20 / CLI', deploy: 'self-hosted' },
  { robosRoot: '/tmp/robos-demo' }
);
console.log(r.targetDir, r.generated);
"
```

The project lands in `/tmp/robos-demo/packages/pulse-metrics`. Set `robosRoot` to a repository root to register the project in that repository's `.robos` instead. Always pass `archetype`. Without `homeDir` in the second argument, the call does not touch `~/.config/robos/git-projects.json`. The unit tests for the generator are in `packages/robos-test/tests/app-wizard/generate-app.test.js`.

## Limits

- Only the web, desktop and CLI archetypes have their own template. PC Video Game, Mobile Phone App, Data Worker / Sync and Reusable Code Library are cards in the UI, but they produce the generic Node.js service or the web template.
- The Mobile Game archetype appears only in the import wizard, not on the creation cards.
- The step 3 contract editor and the data-storage menu do not affect the output.
- The Electron template's `.desktop` file points at an `icon.svg` that the wizard does not create. Add one (see the `update-app-icon` skill).
- The generated `dev-setup.sh` checks only for Node.js and git. It does not install Java, Go or other runtimes.

For a project that already exists, use [Import an existing app]({{ site.baseurl }}{% link app-import-wizard.md %}).
