---
title: "08 — Alex's first day on the project"
parent: Video Production Plan
grand_parent: The Model Problem
layout: default
nav_order: 8
---

# Video 08 — Alex's first day on the project
{: .no_toc }

**Protagonist:** Alex (Developer)
**Arc:** Setup
**Target length:** 3:00
**Apps in frame:** Security Setup · Pass Manager · Dev Tools · Git Projects · Workspace Manager

## Story beat

Alex logged in for the first time. Zero dev tooling, zero repos, zero secrets. By the end of this video Alex is sitting in Cursor with `buildbarn-forms` open, tests green, and a story picked up from the backlog. This is the "three-minute zero-to-productive" demo.

## Pre-seeded state

- VM has Dana's config (Video 01), Pat's stories (Video 02), Jordan's pipeline (Video 03).
- Alex's pass store is empty — secrets will arrive via team-distribution during the video.
- Alex has a GitHub account that's been added to `acme-corp` with push access but no local `gh` auth yet.

## Scene list

1. **First login (0:00–0:25)** — Alex logs in at LightDM. **Security Setup** auto-launches. Wizard runs: pinentry configured, GPG key generated (from scratch — minimal wait), pass store initialized, SSH key generated and added to GitHub via `gh ssh-key add`. Narration covers that this is a one-time wizard.
2. **Secret distribution (0:25–0:55)** — **Pass Manager** opens. Sidebar shows empty store. A notification pops: *"Dana has shared 3 secrets with you. Accept?"* Alex clicks accept. `acme/jira-token`, `acme/github-pat`, `acme/npm-publish-token` land in Alex's store, encrypted to Alex's new GPG key.
3. **Dev Tools (0:55–1:30)** — Open **Dev Tools**. Cursor, VS Code, Claude CLI, ripgrep already on the "recommended" list for this project. Alex clicks **Install all**. Progress bars. Done.
4. **Clone + verify (1:30–2:30)** — Open **Git Projects** → `buildbarn-forms`. Click **Install Project**. RobOS clones, runs the dev-setup script Dana authored (`npm install`), then runs the test script (`npm test`) — 51 tests passing. Green banner.
5. **Workspace ready (2:30–3:00)** — **Workspace Manager** now shows `buildbarn-forms` with git branch `main`, clean state, detected IDEs. Alex clicks **Open in Cursor**. Cut to Cursor open on the code. Narration closes: *"From fresh login to working checkout, three minutes."*

## Narration cues (draft)

| # | At | Text |
|:-:|:-:|:-----|
| 1 | 0:00 | Alex just logged in for the first time. Security Setup runs once: GPG key, SSH key, pass store, GitHub auth. |
| 2 | 0:30 | Team secrets arrive via Pass Manager — encrypted to Alex's new GPG key, never in plain text. |
| 3 | 1:00 | Dev Tools installs the IDEs and CLIs the project needs. The recommendation list is in the Git Projects config Dana set up. |
| 4 | 1:45 | Git Projects clones the repo, runs the dev-setup script, runs the tests. Everything green before Alex touches any code. |
| 5 | 2:35 | Workspace Manager recognizes the new project. One click, Cursor opens on main. |
| 6 | 2:55 | Three minutes from login to working checkout. Now Alex picks up a story. |

## Blockers / ready-checklist

- [ ] Pass Manager "team distribution" UI — not yet built as of v0.0.5. Options: build it for this series (a simple flow that decrypts shared entries with the new GPG key), or narrate past it by pre-seeding Alex's store during cloud-init. **Decide before recording.**
- [ ] Dev Tools must have a "recommended per project" list driven by Git Projects config, not just a global list. Verify.
- [ ] `npm test` on buildbarn-forms at the ad417f7 commit is passing in a fresh clone. **Test on a scratch VM before recording** — if there's drift (dep updates, etc), pin versions.

## Deliverables produced by this video

- Alex's home dir ready for development, with keys + repo + IDE.
- This is the baseline state every engineering-arc video (05–14) starts from, reverted-to between takes.
