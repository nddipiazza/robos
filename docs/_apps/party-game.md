---
title: "RobOS Party Game"
package: party-game
category: "party-games"
icon: party-game.svg
summary: "AI-hosted party game on your RobOS TVs: guests take a survey on their phones, get secret roles, and play mini games built from each other's answers"
description: "AI-hosted party game on your RobOS TVs: guests take a survey on their phones, get secret roles, and play mini games built from each other's answers"
---

# RobOS Party Game

**RobOS Party Game** (`packages/party-game`) is the first game in the **Party Games** category. An animated AI host face runs the show on one or more RobOS TVs, guests play on their phones, and every mini game is written from what the guests (and the house) told the host.

## What you need

- **At least one RobOS TV** paired in [RobOS Smart TV Studio]({{ '/apps/robos-tv/' | relative_url }}). With two or more, each TV gets a screen: the **main stage** (host face and the action), a live **scoreboard**, and a **spotlight** on the guest each round is about. Browser TVs (LG webOS, Samsung Tizen, Google TV) open the game page; Roku TVs show live frames through the RobOS TV channel.
- **An AI agent.** The AI host (a hooded masked figure by default, or a robot) is required: pick it with the shared agent selector (Codex, Antigravity, …). Every agent call runs in the background ahead of when it is needed, so a slow reply never stalls the party, and stock material fills in if a call fails.
- Guests' phones on the same Wi-Fi. They scan the QR code on the TV.
- **Where the host's voice plays** (pick any): the main-stage TVs (browser TVs play it in the page; Roku plays it through the RobOS TV channel), an **RobOS Audio Player speaker** (Google Cast speakers found by the Audio Player or Home Speaker, or a fresh scan), and this computer. A Cast speaker plays one stream at a time, so choose a different speaker from the one playing music.

## How a party runs

1. **Setup.** Pick the TVs, the AI agent and a host personality (game show host, snarky robot, wholesome cheerleader, spooky butler), then customize: which mini games and in what order, rounds, timers, auto-advance, secret roles, survey packs and your own survey questions.
2. **Lobby.** Guests join on their phones and answer the survey (the basics, interests, confessions, wild cards). The AI host welcomes each guest on the TV with a line about their answers.
3. **The party host.** Until someone claims it, every guest sees **I'm the party host**. The party host describes the house: usable spaces (backyard, front yard, garage, basement…), what is special about it (guitar amps in the basement, a hot tub…), games in the house, arts and crafts supplies, tech such as a printer or speaker, the vibe, and anything off-limits. A meter encourages as much detail as possible. The game cannot start until the party host has answered the required questions. The AI host then gives the room a quick "house tour".
4. **The writers' room.** Once everyone is ready, the AI writes the night's show in parallel: a title and opening, a reason for each guest's role, Who Said That? teasers, Most Likely To superlatives, interest trivia, House Quests and bluffs.
5. **Roles.** Every guest gets a role from their answers (The Detective, The Wildcard, The Trickster, The Diplomat, The Champion, The Storyteller, The Underdog, and the secret Mole). Perks appear on their phone: a crossed-out wrong answer, a double down, bonus points for fooling the room.
6. **Mini games**, then standings recaps written by the AI, and a **finale** with the winner, the Mole unmasked, and a custom AI award for every guest.

## Mini games

| Mini game | How it works |
|---|---|
| 🗣️ **Who Said That?** | The host reads a survey answer as a teaser; guess which guest wrote it. |
| 🏅 **Most Likely To** | AI-written superlatives about this group; vote with the room and try to match the AI host's pick. |
| 🏠 **House Quest** | Real challenges using the house: a basement jam on the guitar amps, a craft-supply costume race, a backyard relay. Performers act it out; everyone else judges on their phones. |
| 🧠 **Nerd Alert Trivia** | Multiple-choice trivia about each guest's interests. The resident expert earns a bonus, and anyone who out-nerds them gets one too. |
| 🤖 **Two Truths & a Bot** | Two real facts about a guest and one the AI invented. Spot the fake. |

### Adding a mini game

Mini games share a template (`packages/party-game/lib/minigames/template.js`). A mini game describes its rounds (`buildRounds`), how to score them (`score`), optionally the right answer (`correctOption`) and narration hooks; the engine handles timers, phones, TVs, role perks and scoring. Copy one of the examples, give it a unique id, and add it to `lib/minigames/index.js`. Content written by the AI arrives on `ctx.script`.

## Where things live

- Settings: `~/.config/robos/party-game/settings.json`; finished games: `~/.config/robos/party-game/history/`.
- LAN game server: `:19213` (`/tv?screen=stage|scoreboard|spotlight`, `/join`). DOM snapshot debug port: `19212`.
- TVs are reached through the shared TV engine's app casts (`robos-lib/tv-engine.js`: `castAppToTv`, `/api/app-cast`, `/api/app-cast-frame.jpg`).
