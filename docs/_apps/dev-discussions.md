---
title: "Dev Discussions"
package: dev-discussions
category: core-desktop
icon: dev-discussions.svg
summary: "A chat-style view of discussion threads attached to tasks and pull requests, stored in a local cache with optional posting to GitHub."
description: "Dev Discussions organizes threads as project, feature and work item, saves comments to a local JSON cache and can post them to GitHub with gh. It starts with sample Acme and RobOS data."
---

Dev Discussions presents comments on work items and pull requests the way a team chat does: a workspace and project tree on the left, a thread in the middle, a composer at the bottom.

{: .note }
The first run seeds the cache with sample data (an "Acme Enterprise SDLC" workspace with a petshop project, and a "RobOS Core Platform" workspace). Comments you write are attributed to a fixed "Lead System Architect" user. The "Latency 0.4ms" and "GitHub Budget: 4,892 / 5,000" labels come from that seed data, not from measurements.

## What you do in it

- Pick a workspace, then a project, feature and work item. Filter the list with **All**, **Tasks** or **Pull Requests**.
- Write a message in the composer. The toolbar inserts bold, italic, inline code, a code block, a diff snippet and a quote, and has an **Attach** control. `Enter` sends. Choose where it goes with the radio buttons:
  - **Local & KGraph Cache** saves the comment to the local cache only.
  - **Sync Upstream to GitHub** also runs `gh pr comment` or `gh issue comment` on the project's repository (the `slug` in the cache, for example `acme/petshop-api`).
- On pull-request threads, review comments carry a file path, line number and diff hunk, and can be marked resolved. Comments can get emoji reactions.
- The sync action runs `gh pr view` or `gh issue view` for the open thread and updates the "last synced" time. It returns the remote data but does not merge it into the cache.
- The export buttons (one for the open thread, one for everything) write the threads, comments and attachments as `robos:DiscussionThread`, comment and attachment nodes into `.robos/kgraphs/organization/package.jsonld`, relative to the directory the app was started from. If that file does not exist the nodes are counted but not saved.

## Data and requirements

- Cache: `~/.config/robos/dev-discussions-cache.json`. Delete it to reseed the sample data.
- The `gh` CLI, signed in, for upstream posting and sync. Local use needs nothing else.
- Only `http` and `https` links open in the browser.

```bash
electron packages/dev-discussions
```

Source: [`packages/dev-discussions`](https://github.com/nddipiazza/robos/tree/main/packages/dev-discussions).
