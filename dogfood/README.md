# 🌭 Project Dogfood

> Using RobOS to build RobOS.

This directory tracks notes, workflows, and observations from using RobOS as the primary development environment for developing RobOS itself — a delightfully recursive situation.

## What is Dogfooding?

[Eating your own dog food](https://en.wikipedia.org/wiki/Eating_your_own_dog_food) means using your own product in real work. Every bug we hit, every workflow friction we feel, every feature we wish existed — all while building the thing — is direct signal.

## Setup

The RobOS VM is used as the daily driver for RobOS development:

- **Repo**: `nddipiazza/roboto-os` cloned to `~/source/github.com/nddipiazza/roboto-os`
- **IDE**: VS Code (launched via RobOS Git Projects → "VS Code" button)
- **Terminal**: Tilix with dark theme
- **GitHub AI**: `gh copilot` CLI available in every terminal
- **Work Journal**: `nddipiazza/robos-work-journal` — all AI interactions and task notes auto-logged

## Workflow

1. Open **RobOS Git Projects** → select `roboto-os`
2. Open VS Code or Terminal from the detail panel
3. Use **RobOS Task Planner** to break down features into stories/tasks
4. Use **RobOS Workflow Studio** to manage issue types and transitions
5. Use **RobOS Work Journal** — AI interactions and task completions are auto-logged
6. Use **RobOS Dev Central** to track daily commits and open PRs

## Observations & Notes

### 2026-03-07
- Initial dogfood setup. RobOS VM running stable on QEMU/KVM.
- Right-click taskbar menu working via X RECORD extension + jgmenu.
- All 8 apps branded "RobOS {App Name}".
- Task Planner no longer auto-generates a sample on startup (too slow) — "Generate Sample" button added.
- Window icons now show each app's custom SVG-derived PNG icon.

## Known Friction Points

> Issues discovered while dogfooding — candidates for fixing next.

- [ ] Dev Central commit list shows "Pushed 0 commits" when there are no new commits (fixed 2026-03-07)
- [ ] Taskbar right-click shows all windows instead of clicked window (fixed 2026-03-07)
- [ ] Work Journal journal banner showing even when journal configured (fixed 2026-03-07, CSS `.hidden` rule missing)

## Ideas Generated While Dogfooding

- Per-app context scopes in Context Manager so each app gets relevant AI context
- Work Journal auto-push on every AI interaction log
- "Become a feature reviewer" training mode with sample PRs
