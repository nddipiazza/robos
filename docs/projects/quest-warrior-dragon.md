---
title: "Quest: Warrior Dragon (2D RPG Engine)"
layout: default
parent: Projects
permalink: /projects/quest-warrior-dragon/
nav_order: 4
description: "A fan remake of the NES Dragon Warrior in Godot 4, and the RobOS AI that plays it from the throne room to the Dragonlord."
---

# Quest: Warrior Dragon
{: .no_toc }

A fan remake of the 1986 NES classic Dragon Warrior, built in Godot 4 (`games/quest-warrior-dragon`). You wake up in King Lorik's throne room with nothing but a few gold coins, and you leave it to save Alefgard from the Dragonlord. It also comes with an AI that can play the whole game by itself.
{: .fs-6 }

<details open markdown="block">
  <summary>On this page</summary>
  {: .text-delta }
1. TOC
{:toc}
</details>

![The Dragonlord's true form in battle in Charlock Castle]({{ '/assets/images/quest-warrior-dragon/20_charlock_b7_dragonlord_battle.png' | relative_url }}){: .robos-zoomable-img }

*The end of the road: the Dragonlord's true form, taken from the AI's winning run.*

## Play it

```bash
cd games/quest-warrior-dragon
./play.sh                 # title screen, then start a new quest or load a save
./launch.sh --demo        # sit back and let the demo AI play the opening
```

The save screen is the **Adventure Log**. It lists King Lorik's saved logs, newest first, alongside chapter presets that drop you in at any point of the story, from the throne room to the gates of Charlock. Pick one and the card beside the list shows the hero's level, gear, where you are and how far the quest has got.

It plays like the original. The world is dark in caves until you light a torch or learn RADIANT. Shops trade your old sword in when you buy a new one. A pack holds eight kinds of tools, and herbs and keys stack. Townspeople tell you where to go next, and what they say is true: Erdrick's Tablet really does tell you where his token is buried.

## Watch the AI beat it

Proving every tile is reachable doesn't prove the game can be won, so the RobOS AI plays it. `PlayGameBrain.gd` takes the controller and works its way from King Lorik's first speech to the ending credits. It uses nothing a player doesn't have: the same buttons you press, and the screen read through the game's control service. It walks a list of goals in story order (buy the next sword, open the next chest, rescue the princess) and grinds monsters for levels or gold whenever the next goal is out of reach.

The first full win took two and a half hours at eight times game speed, in one uninterrupted run, with a level-21 hero carrying Erdrick's Sword. [Watch the whole run on YouTube](https://www.youtube.com/watch?v=o6RHKMKD2AU); the chapters jump to each part of the quest.

![Princess Gwaelin asking to be taken back to her father]({{ '/assets/images/quest-warrior-dragon/12_swamp_cave_princess_gwaelin.png' | relative_url }}){: .robos-zoomable-img }

*"Please take me back to my father." The AI found Gwaelin at the end of the Swamp Cave and carried her home.*

To run it yourself, open **RobOS Game Playthrough** (`packages/game-playthrough`) and press **New run**. You can play the whole game, resume from any point the AI has saved, or replay one part of it. While it plays, a tray icon fills up as the quest advances. The window shows the game, the hero's stats and gear, and what the AI is trying to do right now. Every finished step has its own video, and **Export to MP4** joins them into one movie with chapters. From a terminal, `python3 tests/e2e/play_full_game.py --stepped` does the same and opens the app on its own.

### What the AI found

The rule for the AI was "fix the game, not the brain". Each time it got stuck, the cause was something a human player would have hit too:

- **Soft-locked in the throne room.** After bringing Gwaelin home, the AI tried to eat an herb to make room for a chest, and nothing happened. Herbs simply didn't work in the castle, and the castle counted every herb as its own pack slot, so the pack looked full when it wasn't.
- **An innkeeper in the weapon shop.** Brecconary's innkeeper stood behind the weapon counter, and Kol's stood on a tree. The AI rested at whatever counter it was sent to, which looked very strange on video. Every innkeeper now stands behind the inn counter, where the original map has them.
- **Chests that never disappeared.** On the NES an opened chest vanishes. Here it stayed on the map forever.
- **Townspeople who lied.** One sent you to a "Silver Flute" for the Golem, which doesn't exist (you need the Fairy Flute from Kol). Brecconary was "south" of the castle when it's next door to the east. And Erdrick's Tablet, which tells you where the three relics are, had its message written but never shown.

Earlier runs turned up more: Charlock's exit gate that you couldn't walk through, wrong monster resistances, a Cantlin shop with nothing on the shelves, and Wings that did nothing outside.

### The parts that make it Dragon Warrior

- **The Golem at Cantlin's gate.** Cantlin is walled in, with one gate guarded by a Golem that hits far harder than anything nearby. Play the Fairy Flute in battle and it falls asleep every time. Beat it once and the town is open for good.
- **The swamp around Charlock.** The Dragonlord's island is ringed by poison swamp that hurts with every step, unless you wear Erdrick's Armor. It dries up once the Dragonlord falls.
- **Keys run out.** Every locked door eats a Magic Key, and the only free one opens the throne-room gate. Tantegel's treasury and the Stones of Sunlight wait until you buy more in Rimuldar.
- **The ending.** You carry Gwaelin home in your arms. Beating the Dragonlord hands you the Ball of Light, and the monsters vanish. King Lorik offers you his throne and you turn it down. Gwaelin insists on coming with you, and the two of you walk out of Tantegel as the credits roll.

## Is every place reachable?

Before the AI could play, the game had to be finishable on paper. `tests/test_map_completeness.py` starts at King Lorik and walks every step a player could take: through doors, up and down stairs, across the overworld and over the Rainbow Bridge once it's built. It fails if any town, cave, chest or the Dragonlord's altar can't be reached. Add `--screenshots` to capture a picture at each stop of the quest for the [interactive tour]({{ '/games/quest-warrior-dragon/proof-of-viability.html' | relative_url }}).

```bash
python3 games/quest-warrior-dragon/tests/test_map_completeness.py
```

More: the [AI playthrough page](https://rowbose.com/games/quest-warrior-dragon/ai-playthrough/) shows how the AI and the app work, and the [game page]({{ '/games/quest-warrior-dragon/' | relative_url }}) has screenshots from every corner of Alefgard.
