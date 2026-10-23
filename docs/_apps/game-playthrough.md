---
title: "RobOS Game Playthrough"
package: game-playthrough
category: games
icon: game-playthrough.svg
summary: "Run and watch the Quest: Warrior Dragon end-to-end AI playthrough with per-milestone videos, checkpoints and run history"
description: "Run and watch the Quest: Warrior Dragon end-to-end AI playthrough with per-milestone videos, checkpoints and run history"
---

RobOS Game Playthrough runs the end-to-end AI playthrough of [Quest: Warrior Dragon]({{ '/games/quest-warrior-dragon/' | relative_url }}) and lets you watch it. The in-engine AI plays the whole game the way a player would, using only real button presses, and works through 74 milestones from King Lorik's throne room to the ending. This app starts those runs, follows them live, and keeps every earlier run so you can go back to it.

## What it does

- **New run**: play the whole game from the throne room, resume from any milestone that has a checkpoint, or replay a single milestone. Pick the speed (×1 to ×12), stop after a given milestone, and choose whether to show the game window and play its sound.
- **Live view**: the current milestone and the AI's objective, hero stats, the current battle, equipment and pack, the AI's inputs, the brain's event log, and a game screenshot every 1.5 seconds.
- **Milestones**: all 74 milestones in order. Ones the AI had to grind for are named "Grind + ...". Click a finished milestone to play its video and see the checkpoint saved right after it.
- **Runs**: the current run and every archived run, with status, milestones reached, battles, deaths and time. View any of them in the same screens, and read the output of a run started from the app.
- **Tray icon**: a progress ring that follows the run, with the current milestone, Start a full run, Stop run, and the latest video.

## Running it

```bash
cd packages/game-playthrough && npm install
npx electron --no-sandbox .
```

The app finds the game in `games/quest-warrior-dragon` next to it in the repository. An installed copy uses `ROBOS_REPO`, `--game-dir`, or the folder you pick with **Game folder...** on the Runs screen. Runs started from the command line with `python3 tests/e2e/play_full_game.py --stepped` open this app on their own, and it shows them like any other run.

Each run writes `tests/e2e/reports/playthrough/` in the game folder: `live.json` (refreshed every second), `playthrough.json`, `videos/NN-<milestone>.mp4` and `checkpoints/NN-<milestone>.json`. Starting a new full run moves the previous one to `reports/archive/<started>-<status>/`.

Snapshot debug port: `19203`. Source: [`packages/game-playthrough`](https://github.com/nddipiazza/robos/tree/main/packages/game-playthrough).

