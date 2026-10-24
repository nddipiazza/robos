---
title: "Proposal: Gitea forge for E2E tests"
layout: default
nav_exclude: true
description: "A local Git forge inside the E2E container, so apps that talk to a Git host can be tested without GitHub or network access."
---

# Proposal: Gitea forge for E2E tests
{: .no_toc }

A local Git forge inside the E2E container, so apps that talk to a Git host can be tested without GitHub or network access.
{: .fs-6 }

{: .important }
Proposal, not built. Nothing on this page exists in the repository yet except where "What exists today" says so.

## Proposal

Start a Gitea server (SQLite database, data under `/tmp`) when an E2E run needs one, seed it, and point the apps at it.

- Add a Gitea binary or sidecar to the E2E image built from `infra/docker`.
- Add helpers to `packages/robos-test` to start, seed and reset the forge. The original spec named `startTestForge()`, `stopTestForge()`, `seedForgeRepo()` and `resetForgeState()`.
- Seed users, an organization, repositories with branches, issues and pull requests.
- Let Git Projects, Issue Manager and Git Login Manager read a forge base URL from the environment. The original spec named `ROBOS_GIT_FORGE_URL` and `ROBOS_GITHUB_API_BASE`.

The goal is to exercise clone, push, issue and pull request flows against a real forge in `./scripts/e2e-container.sh` runs with no external network.

## What exists today

- `./scripts/e2e-container.sh` runs the tests in Docker through `infra/docker/run.sh`. The image files in `infra/docker` do not mention Gitea.
- `packages/robos-test/fixtures` holds `sample-robos-root` and `standalone-ide-window` only. No code in `packages` reads `ROBOS_GIT_FORGE_URL` or `ROBOS_GITHUB_API_BASE`.
- Issue Manager runs the `gh` CLI (`packages/issue-manager/main.js`).
- [Task Servers]({{ '/apps/task-servers/' | relative_url }}) offers a "Gitea (Local OSS Forge)" entry, but `createAdapter` in `packages/robos-task-client/index.js` only supports `jira` and `github`.
- [Gitea Browser]({{ '/apps/gitea-browser/' | relative_url }}) (`packages/gitea-browser`) is a static page that looks like a Gitea issue list at `http://localhost:3000`. It makes no network calls and is not a forge.

## Source

Raw note: [`ideas/inbox/e2e-gitea-support.txt`](https://github.com/nddipiazza/robos/blob/main/docs/ideas/inbox/e2e-gitea-support.txt). The earlier long spec is in the git history of this file.
