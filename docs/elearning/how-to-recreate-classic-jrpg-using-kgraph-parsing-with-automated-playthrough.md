# How to Rebuild a Classic Video Game: The Whole Course on One Page

This page tells the whole story in one go. For step-by-step lessons, clips you can open full-size, quizzes and hands-on labs, use the **Course & Labs** tab.

**In one sentence:** we collect what fans have written about an old game, turn it into organized facts, rebuild the game from those facts, and have a robot play it to check our work.

**You don't need to type commands.** Each hands-on step gives you a sentence to paste into an AI agent, such as Claude Code, GitHub Copilot, Codex or Gemini, and explains what it will do. The examples were tested with Claude Code, and any agent that can read files and run commands should handle them.

---

## The five stages

| Stage | In plain English | The tool |
| --- | --- | --- |
| 1. Collect | Gather maps and guide pages into one private folder | On a real game, you, by hand. In this course, a program on a practice site |
| 2. Read | Pull exact facts out of messy pages | The parser |
| 3. Organize | Connect every fact to what it relates to, and where it came from | The knowledge graph |
| 4. Rebuild | Turn the facts into maps, shops and battles | A build step and a game engine |
| 5. Check | Play the game automatically, then watch the recording | A robot player and a person |

## Our example

Ember Quest is a game we invented for this course, with a made-up fan site. It's tiny, and we own all of it, so we can show you everything. Every clip below is a real recording of the real tools running on one computer. Nothing here touches anyone else's website.

## Stage 1: Collect

The harvester reads a page that lists maps, keeps only the files whose names start with `EmberQuest-`, and writes a shopping list called a manifest.

![A browser opens the map atlas while the harvester writes its list of three Ember Quest maps](/assets/elearning/jrpg-kgraph/demo/scrape-discover.gif)

Then it downloads the list, pausing between files, and records a fingerprint of each one.

![The harvester downloads ten files while the collection folder fills up](/assets/elearning/jrpg-kgraph/demo/scrape-download.gif)

**Our rule:** on real fan sites, people collect by hand. What's collected stays private, and is never published.

## Stages 2 and 3: Read and organize

The parser sorts the files, reads tables with ordinary code, compares sources, and reports what's missing. Follow one fact, the price of the Iron Sword:

| Source | Says | What the parser does |
| --- | --- | --- |
| The main guide | 40 gold | Uses it |
| A player's notes | 45 gold | Flags the disagreement for a person |
| A page about a remake | 99 gold | Sets the whole page aside |

![The parser sets aside the remake page and reports that two sources disagree about the price](/assets/elearning/jrpg-kgraph/demo/parse.gif)

When an AI model reads flowing paragraphs, it has to supply the exact sentence behind each fact. Code then checks that the sentence is really in the file. No quote, no fact.

## Stage 4: Rebuild

A map picture is cut into 16-by-16-pixel tiles. Identical tiles get the same number, and a person notes what each different one is, and whether you can walk on it. The picture becomes a grid of numbers the game can use. Prices and monster stats flow in from the parsed facts, so nobody types them in by hand.

## Stage 5: Check

A robot follows a script written in near-plain English, pressing real keys and asking the game for its state after each step.

```
When the hero walks to the weapon shop
And the hero buys the "Iron Sword"
Then the hero has 10 gold
```

![A robot plays Ember Quest from the first town to the boss, ticking off each line of its script](/assets/elearning/jrpg-kgraph/demo/playthrough.gif)

The robot reads the game state: the small set of values, such as position, gold and HP, that holds everything true about the game right now. The hero's 50 starting gold is a setting typed in by hand and copied onto that state, while prices and monster numbers come from the fan site through the parser.

But a test only checks what you asked it to. Here, the hero is standing inside a tree, and the check that the map name is correct still passes. That really happened on the Final Fantasy build, which is why a person watches the recordings.

![The hero standing inside a tree while the check on the map name passes](/assets/elearning/jrpg-kgraph/demo/hero-in-a-tree.png)

## The real thing: Final Fantasy (NES, 1990)

| | Ember Quest | Final Fantasy |
| --- | --- | --- |
| Files looked at | 12 | 82 |
| Connected facts | 25 | 1,206 |
| Monster entries | 3 | 164 |
| Weapons and armor | 5 | 80 |
| Spells | 2 | 68 |
| Treasure chests | 2 | 251 |
| Disagreements between sources | 1 | 5 |

Fan guides covered shops and story, but not exact walls, monster accuracy or level-up growth. Those came from the game's own data tables, read with the help of fans' notes and kept private. The robot-tested part of the real game is its opening chapter. Only parsed facts and newly generated art are ever published, through the `jrpg-parser publish` command.

## Then: game programming and Godot

Modules 8 to 12 teach you to work on a real game, using Quest: Warrior Dragon, a complete fan remake of Dragon Warrior in this project.

| Module | What you learn |
| --- | --- |
| 8. Game programming concepts | The game loop, state, input, tile grids, collision, interpolation, state machines, randomness, events, and data |
| 9. The editor | Nodes, scenes, scripts, autoloads and just enough GDScript |
| 10. One key press | Following a key press through the real code, and controlling a game from outside it |
| 11. Battles and data | Where a monster's numbers come from, and how to find which code really runs |
| 12. Make a change | Describe, change, test, watch and undo, by breaking a real test and fixing it |

![A test run of Quest Warrior Dragon: the hero opens a chest next to them and finds a Torch](/assets/elearning/jrpg-kgraph/demo/qwd-chest.gif)

## Glossary

| Word | Meaning |
| --- | --- |
| Scraping | Having a program save copies of web pages |
| Harvester | Our scraping program |
| Manifest | A list of the files to download |
| Parser | A program that pulls facts out of messy pages |
| Knowledge graph | Facts stored as a web of connections |
| Tile | One small square of a map |
| Sprite | A small moving picture of a character |
| HP | How much damage something can take |
| JSON | A way of writing facts that people and programs can both read |
| Gherkin | Near-plain English for writing test scripts |
| Cucumber | A tool family that runs those scripts |
| AI agent | An assistant that can read a project's files and run programs |
| Godot | A free game engine, used for Quest: Warrior Dragon |
| Node | In Godot, one small part of a game. In a knowledge graph, one item |
| Scene | In Godot, a saved tree of nodes, such as a room |
| Autoload | In Godot, code that stays running across scene changes |
| ROM | A copy of the data on an old game cartridge |
| Clean-room art | New images we made, instead of the original game's |
