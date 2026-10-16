---
title: "Context Manager"
package: context-manager
category: ai-agents
icon: context-manager.svg
summary: "Register GitHub repositories and local folders as context sources, check which agent instruction files they contain, and build one combined context text."
description: "Context Manager keeps a list of repos and folders, scans them for files like AGENTS.md and README.md, and can draft AGENTS.md, Copilot instructions and a Mermaid graph with an AI helper that this repository does not include."
---

Context Manager answers "what will an agent read when it opens this repository?" You register sources, and the app shows which context files each one has.

## What you do in it

1. Click **+ Add Source** and choose **GitHub Repo** (search with `gh` or pick from your repos), **Local Folder** (path or **Browse...**) or **Select from Git Projects** (the list in `~/.config/robos/git-projects.json`, see [Git Projects]({{ '/apps/git-projects/' | relative_url }})).
2. Select the source. For a GitHub repo, **Clone** runs `git clone` into `~/source/github.com/<org>/<repo>`, and **Pull** runs `git pull`. The **Active** switch includes or excludes the source from the combined context. **VS Code** runs `code <folder>`, **GitHub** opens the repo page, **Rescan Files** re-reads the folder and **Remove** deletes the source from the list.
3. Look through the tabs: **Context Files**, **AGENTS.md**, **Copilot Instructions** and **Knowledge Graph**.
4. Click **View Combined Context** to get one text blob (with **Copy to Clipboard** and a **Raw** view). For each active source it concatenates up to 4,000 characters from each of the first eight known files that exist: `README.md`, `readme.md`, `README.rst`, `AGENTS.md`, `agents.md`, `CLAUDE.md`, `claude.md` and `.cursorrules`.

The scan also looks for `ARCHITECTURE.md`, `CONTRIBUTING.md`, `CODEOWNERS`, `docs/README.md`, build files (`package.json`, `pom.xml`, `build.gradle`, `Cargo.toml`, `go.mod`) and `.github/copilot-instructions.md`.

## AI-assisted drafts

Next to a missing `AGENTS.md` or `.github/copilot-instructions.md`, **Create with AI Agent** drafts one and **Save to Repo** writes it into the folder. The **Knowledge Graph** tab has **Generate via AI**, which asks for a Mermaid diagram built from the README, `AGENTS.md`, `ARCHITECTURE.md` and the build file.

{: .note }
These buttons call a `robos-copilot-lib` module loaded from `/usr/local/share/robos/robos-copilot-lib`. That module is not in this repository. Without it they report "AI copilot library not available"; the rest of the app works.

## Data

- The source list is `~/.config/robos/context-sources.json`. Each source is also written to the SDLC knowledge graph (`SDLCKnowledgeGraphStore` in `packages/robos-graph`) as a context source, and sources found there are merged into the list at startup.
- Generated drafts are logged to `~/.config/robos/journal-events.json`.

## Requirements

`git` for clone and pull, the `gh` CLI for repository search and listing, and VS Code (`code`) for the editor button. Only one window runs at a time. Source: [`packages/context-manager`](https://github.com/nddipiazza/robos/tree/main/packages/context-manager).
